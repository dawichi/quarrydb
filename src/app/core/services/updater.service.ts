import { Injectable, signal } from '@angular/core'
import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

export interface PendingUpdate {
    version: string
    /** Release date formatted for display (e.g. "Jun 6, 2026"), or `null` if the feed didn't include one. */
    releasedOn: string | null
}

const RELEASES_URL = 'https://github.com/dawichi/quarrydb/releases'

/** Persists the version the user chose to skip — silent re-checks stop surfacing it. */
const SKIPPED_VERSION_KEY = 'quarry_skipped_update_version'

/** Formats the updater feed's `pub_date` (ISO 8601), pinned to UTC so it reads the same regardless of the viewer's timezone. */
function formatReleaseDate(iso: string | undefined): string | null {
    if (!iso) return null
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
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

    /**
     * Update details from a manual "Check for Updates…" — feeds the modal's "available" view.
     * Kept separate from `pending` (the silent poller's passive banner) so a manual check can
     * never resurrect the banner for a version the user already chose to skip.
     */
    readonly checkedUpdate = signal<PendingUpdate | null>(null)

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
            if (update?.available && update.version !== localStorage.getItem(SKIPPED_VERSION_KEY)) {
                this.pending.set({ version: update.version, releasedOn: formatReleaseDate(update.date) })
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
                this.checkedUpdate.set({ version: update.version, releasedOn: formatReleaseDate(update.date) })
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

    /** Opens the GitHub release page for `version` in the system browser — we link out instead of rendering notes inline. */
    openReleaseNotes(version: string): void {
        void openUrl(`${RELEASES_URL}/tag/v${version}`)
    }

    /**
     * Remembers `version` as skipped so the silent poller stops surfacing it. A manual
     * "Check for Updates…" still reports the truth — skipping only quiets the passive nag.
     */
    skipVersion(version: string): void {
        localStorage.setItem(SKIPPED_VERSION_KEY, version)
        this.pending.set(null)
        this.checkedUpdate.set(null)
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
