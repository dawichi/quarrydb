import { Injectable, inject } from '@angular/core'
import { listen } from '@tauri-apps/api/event'
import { ProviderRegistryService } from '../providers/provider-registry.service'
import { UpdaterService } from './updater.service'

@Injectable({ providedIn: 'root' })
export class MenuService {
    private readonly providers = inject(ProviderRegistryService)
    private readonly updaterSvc = inject(UpdaterService)

    async register(): Promise<void> {
        await listen('menu:open-database', () => {
            void this.providers.openFromHome()
        })
        await listen('menu:open-sample', () => {
            void this.providers.openSample()
        })
        await listen('menu:check-for-updates', () => {
            void this.updaterSvc.checkManually()
        })
        await listen('menu:hard-reset', () => {
            localStorage.clear()
            window.location.reload()
        })
    }
}
