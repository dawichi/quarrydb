import { Injectable, signal } from '@angular/core'
import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

export interface PendingUpdate {
    version: string
    notes: string
}

export type ManualCheckResult = 'checking' | 'up-to-date' | 'available' | 'error'

/** Re-check cadence while the app is running (mirrors T3 Code's auto-update poller). */
const POLL_INTERVAL_MS = 4 * 60 * 1000

@Injectable({ providedIn: 'root' })
export class UpdaterService {
    readonly pending = signal<PendingUpdate | null>(null)
    readonly installing = signal(false)

    /** Result of a user-triggered check (menu: "Check for Updates…"), shown in a modal. */
    readonly manualCheck = signal<ManualCheckResult | null>(null)
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
        this.manualCheck.set('checking')
        try {
            const [update, version] = await Promise.all([check(), getVersion()])
            this.currentVersion.set(version)
            if (update?.available) {
                this.pending.set({ version: update.version, notes: update.body ?? '' })
                this.manualCheck.set('available')
            } else {
                this.manualCheck.set('up-to-date')
            }
        } catch {
            this.manualCheck.set('error')
        }
    }

    dismissManualCheck(): void {
        this.manualCheck.set(null)
    }

    async installUpdate(): Promise<void> {
        const update = await check()
        if (!update?.available) return
        this.installing.set(true)
        try {
            await update.downloadAndInstall()
            await relaunch()
        } catch {
            this.installing.set(false)
        }
    }

    dismiss(): void {
        this.pending.set(null)
    }
}
