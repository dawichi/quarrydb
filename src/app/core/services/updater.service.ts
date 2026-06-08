import { Injectable, signal } from '@angular/core'
import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

export interface PendingUpdate {
    version: string
    notes: string
}

/**
 * Drives the single shared update modal — the manual "Check for Updates…" result
 * and the install/relaunch narration both reuse it, so the user always has one
 * place to look for what's happening with updates.
 */
export type UpdateModalStatus =
    | 'checking'
    | 'up-to-date'
    | 'available'
    | 'error'
    | 'downloading'
    | 'downloaded'
    | 'restarting'
    | 'install-error'

/** Re-check cadence while the app is running (mirrors T3 Code's auto-update poller). */
const POLL_INTERVAL_MS = 4 * 60 * 1000

/** How long each install stage holds on screen — long enough to read, short enough to not feel sluggish. */
const STAGE_PAUSE_MS = 2200

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

@Injectable({ providedIn: 'root' })
export class UpdaterService {
    readonly pending = signal<PendingUpdate | null>(null)

    /** Status behind the shared update modal — manual-check results and install progress alike. */
    readonly modalStatus = signal<UpdateModalStatus | null>(null)
    readonly currentVersion = signal('')

    /**
     * Starts periodic background re-checks for the lifetime of the app. Reuses the silent
     * `checkForUpdate` path — no modal feedback, just the passive banner if one is found.
     */
    startPolling(): void {
        setInterval(() => void this.checkForUpdate(), POLL_INTERVAL_MS)
    }

    async checkForUpdate(): Promise<void> {
        try {
            const update = await check()
            if (update?.available) {
                this.pending.set({
                    version: update.version,
                    notes: update.body ?? '',
                })
            }
        } catch {
            // Network unavailable or endpoint not yet live — silently ignore
        }
    }

    async checkManually(): Promise<void> {
        this.modalStatus.set('checking')
        try {
            const [update, version] = await Promise.all([check(), getVersion()])
            this.currentVersion.set(version)
            if (update?.available) {
                this.pending.set({ version: update.version, notes: update.body ?? '' })
                this.modalStatus.set('available')
            } else {
                this.modalStatus.set('up-to-date')
            }
        } catch {
            this.modalStatus.set('error')
        }
    }

    dismissModal(): void {
        this.modalStatus.set(null)
    }

    /**
     * Downloads, installs, and relaunches into the new version — narrated step by step
     * through the shared modal (instead of a silent inline spinner) so the user always
     * sees what's happening. Each stage holds for `STAGE_PAUSE_MS` so it reads clearly
     * even though the underlying steps themselves are close to instant.
     */
    async installUpdate(): Promise<void> {
        const update = await check()
        if (!update?.available) return

        this.pending.set(null) // the modal takes over narrating from here — hide the passive banner
        this.modalStatus.set('downloading')
        try {
            await update.downloadAndInstall()

            this.modalStatus.set('downloaded')
            await sleep(STAGE_PAUSE_MS)

            this.modalStatus.set('restarting')
            await sleep(STAGE_PAUSE_MS)

            await relaunch()
        } catch {
            this.modalStatus.set('install-error')
        }
    }

    dismiss(): void {
        this.pending.set(null)
    }
}
