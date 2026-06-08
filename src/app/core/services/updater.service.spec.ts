import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdaterService } from './updater.service'

// `vi.mock` factories are hoisted above imports — `vi.hoisted` lets us share the
// underlying `vi.fn()`s so each test can drive `check`/`relaunch`/`getVersion` directly.
const { checkMock, relaunchMock, getVersionMock } = vi.hoisted(() => ({
    checkMock: vi.fn(),
    relaunchMock: vi.fn(),
    getVersionMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({ check: checkMock }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: relaunchMock }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: getVersionMock }))

/** Minimal stand-in for the `Update` resource — only the members `UpdaterService` touches. */
interface FakeUpdate {
    available: true
    version: string
    body?: string
    downloadAndInstall: ReturnType<typeof vi.fn>
}

function fakeUpdate(
    opts: { version?: string; body?: string; downloadAndInstall?: ReturnType<typeof vi.fn> } = {},
): FakeUpdate {
    return {
        available: true,
        version: opts.version ?? '0.2.0',
        body: opts.body,
        downloadAndInstall: opts.downloadAndInstall ?? vi.fn().mockResolvedValue(undefined),
    }
}

/** Mirrors the service's `STAGE_PAUSE_MS` — how long each install stage holds before advancing. */
const STAGE_PAUSE_MS = 2200

let service: UpdaterService

beforeEach(() => {
    vi.clearAllMocks()
    service = new UpdaterService()
})

afterEach(() => {
    vi.useRealTimers()
})

// ─── checkForUpdate (silent — feeds the passive banner) ───────────────────────

describe('checkForUpdate', () => {
    it('stages the update for the banner when one is available', async () => {
        checkMock.mockResolvedValue(fakeUpdate({ version: '0.2.0', body: 'New stuff' }))

        await service.checkForUpdate()

        expect(service.pending()).toEqual({ version: '0.2.0', notes: 'New stuff' })
    })

    it('falls back to an empty notes string when the release has no body', async () => {
        checkMock.mockResolvedValue(fakeUpdate({ body: undefined }))

        await service.checkForUpdate()

        expect(service.pending()?.notes).toBe('')
    })

    it('leaves pending unset when already up to date', async () => {
        checkMock.mockResolvedValue(null)

        await service.checkForUpdate()

        expect(service.pending()).toBeNull()
    })

    it('silently swallows errors — e.g. offline or endpoint not yet live', async () => {
        checkMock.mockRejectedValue(new Error('network unavailable'))

        await expect(service.checkForUpdate()).resolves.toBeUndefined()
        expect(service.pending()).toBeNull()
    })
})

// ─── startPolling (background re-checks) ──────────────────────────────────────

describe('startPolling', () => {
    it('re-checks silently every 4 minutes — mirrors T3 Code cadence', () => {
        vi.useFakeTimers()
        checkMock.mockResolvedValue(null)

        service.startPolling()
        expect(checkMock).not.toHaveBeenCalled()

        vi.advanceTimersByTime(4 * 60 * 1000)
        expect(checkMock).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(4 * 60 * 1000)
        expect(checkMock).toHaveBeenCalledTimes(2)
    })
})

// ─── checkManually (menu: "Check for Updates…" — feeds the shared modal) ──────

describe('checkManually', () => {
    it('reports "available", stages the update, and records the running version', async () => {
        checkMock.mockResolvedValue(fakeUpdate({ version: '0.2.0', body: 'Notes' }))
        getVersionMock.mockResolvedValue('0.1.6')

        await service.checkManually()

        expect(service.modalStatus()).toBe('available')
        expect(service.currentVersion()).toBe('0.1.6')
        expect(service.pending()).toEqual({ version: '0.2.0', notes: 'Notes' })
    })

    it('reports "up-to-date" without staging an update', async () => {
        checkMock.mockResolvedValue(null)
        getVersionMock.mockResolvedValue('0.1.6')

        await service.checkManually()

        expect(service.modalStatus()).toBe('up-to-date')
        expect(service.pending()).toBeNull()
    })

    it('reports "error" when the check fails', async () => {
        checkMock.mockRejectedValue(new Error('offline'))

        await service.checkManually()

        expect(service.modalStatus()).toBe('error')
    })
})

// ─── dismiss / dismissModal ────────────────────────────────────────────────────

describe('dismiss', () => {
    it('clears the pending update', async () => {
        checkMock.mockResolvedValue(fakeUpdate())
        await service.checkForUpdate()
        expect(service.pending()).not.toBeNull()

        service.dismiss()

        expect(service.pending()).toBeNull()
    })
})

describe('dismissModal', () => {
    it('clears the modal status', async () => {
        checkMock.mockResolvedValue(null)
        getVersionMock.mockResolvedValue('0.1.6')
        await service.checkManually()
        expect(service.modalStatus()).not.toBeNull()

        service.dismissModal()

        expect(service.modalStatus()).toBeNull()
    })
})

// ─── installUpdate (narrated through the shared modal) ────────────────────────

describe('installUpdate', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    it('downloads, narrates each stage, then installs and relaunches', async () => {
        const update = fakeUpdate({ version: '0.2.0' })
        checkMock.mockResolvedValue(update)
        // Pre-stage it as the banner would, to confirm install takes over from it.
        service.pending.set({ version: '0.2.0', notes: '' })

        const result = service.installUpdate()

        // Flush the `check()` + `downloadAndInstall()` microtasks without firing the stage timers yet.
        await vi.advanceTimersByTimeAsync(0)
        expect(service.modalStatus()).toBe('downloaded')
        expect(service.pending()).toBeNull() // the modal takes over — passive banner hides

        await vi.advanceTimersByTimeAsync(STAGE_PAUSE_MS)
        expect(service.modalStatus()).toBe('restarting')
        expect(relaunchMock).not.toHaveBeenCalled() // still pausing on this stage

        await vi.advanceTimersByTimeAsync(STAGE_PAUSE_MS)
        await result

        expect(update.downloadAndInstall).toHaveBeenCalledOnce()
        expect(relaunchMock).toHaveBeenCalledOnce()
    })

    it('reports "install-error" if the download/install fails', async () => {
        const update = fakeUpdate({ downloadAndInstall: vi.fn().mockRejectedValue(new Error('disk full')) })
        checkMock.mockResolvedValue(update)

        await service.installUpdate()

        expect(service.modalStatus()).toBe('install-error')
        expect(relaunchMock).not.toHaveBeenCalled()
    })

    it('reports "install-error" if the relaunch is denied (e.g. missing OS permission)', async () => {
        const update = fakeUpdate()
        checkMock.mockResolvedValue(update)
        relaunchMock.mockRejectedValue(new Error('process.restart not allowed'))

        const result = service.installUpdate()
        await vi.advanceTimersByTimeAsync(STAGE_PAUSE_MS * 2)
        await result

        expect(service.modalStatus()).toBe('install-error')
    })

    it('does nothing when no update is available', async () => {
        checkMock.mockResolvedValue(null)

        await service.installUpdate()

        expect(service.modalStatus()).toBeNull()
        expect(relaunchMock).not.toHaveBeenCalled()
    })
})
