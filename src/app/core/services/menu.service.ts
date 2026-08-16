import { Injectable, inject } from '@angular/core'
import { listen } from '@tauri-apps/api/event'
import { ProviderRegistryService } from '../providers/provider-registry.service'
import { DiagnosticsService } from './diagnostics.service'
import { UpdaterService } from './updater.service'

@Injectable({ providedIn: 'root' })
export class MenuService {
    private readonly providers = inject(ProviderRegistryService)
    private readonly diagnostics = inject(DiagnosticsService)
    private readonly updaterSvc = inject(UpdaterService)

    async register(): Promise<void> {
        try {
            await Promise.all([
                listen('menu:open-database', () => {
                    void this.providers.openFromHome()
                }),
                listen('menu:open-sample', () => {
                    void this.providers.openSample()
                }),
                listen('menu:check-for-updates', () => {
                    void this.updaterSvc.checkManually()
                }),
                listen('menu:export-diagnostics', () => {
                    void this.diagnostics.exportReport()
                }),
                listen('menu:hard-reset', () => {
                    localStorage.clear()
                    window.location.reload()
                }),
            ])
        } catch {
            // The browser preview has no native Tauri menu event bridge.
            // Native menu registration remains active when running inside Tauri.
        }
    }
}
