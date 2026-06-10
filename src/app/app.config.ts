import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core'
import { provideRouter } from '@angular/router'

import { routes } from './app.routes'
import { SqliteWorkspaceStore } from './core/store/sqlite-workspace.store'
import { WorkspaceStore } from './core/store/workspace.store'

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideRouter(routes),
        { provide: WorkspaceStore, useExisting: SqliteWorkspaceStore },
    ],
}
