import { Injectable, signal } from '@angular/core'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export interface PendingUpdate {
    version: string
    notes: string
}

@Injectable({ providedIn: 'root' })
export class UpdaterService {
    readonly pending = signal<PendingUpdate | null>(null)
    readonly installing = signal(false)

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
