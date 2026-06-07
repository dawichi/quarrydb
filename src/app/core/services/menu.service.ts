import { Injectable, inject } from '@angular/core'
import { listen } from '@tauri-apps/api/event'
import { UpdaterService } from './updater.service'
import { WorkspaceStore } from '../store/workspace.store'

@Injectable({ providedIn: 'root' })
export class MenuService {
    private readonly workspaceStore = inject(WorkspaceStore)
    private readonly updaterSvc = inject(UpdaterService)

    async register(): Promise<void> {
        await listen('menu:open-database', () => {
            void this.workspaceStore.openDatabase()
        })
        await listen('menu:open-sample', () => {
            void this.workspaceStore.openSampleDatabase()
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
