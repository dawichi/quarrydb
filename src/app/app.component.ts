import { Component, effect, inject, OnInit, signal, untracked } from '@angular/core'
import { MenuService } from './core/services/menu.service'
import { SessionService } from './core/services/session.service'
import { UpdaterService } from './core/services/updater.service'
import { WorkspaceStore } from './core/store/workspace.store'
import { CreateTableModalComponent } from './features/create-table-modal/create-table-modal.component'
import { EditModeComponent } from './features/edit-mode/edit-mode.component'
import { PipelineBuilderComponent } from './features/pipeline-builder/pipeline-builder.component'
import { TableSettingsModalComponent } from './features/table-settings-modal/table-settings-modal.component'
import { TableViewerComponent } from './features/table-viewer/table-viewer.component'
import { TriggerModalComponent } from './features/trigger-modal/trigger-modal.component'
import { TutorialOverlayComponent } from './features/tutorial/tutorial-overlay.component'
import { UpdateBannerComponent } from './features/update-banner/update-banner.component'
import { UpdateCheckModalComponent } from './features/update-check-modal/update-check-modal.component'
import { ViewModalComponent } from './features/view-modal/view-modal.component'
import { WelcomeComponent } from './features/welcome/welcome.component'
import { SidebarComponent } from './layout/sidebar/sidebar.component'

@Component({
    selector: 'app-root',
    imports: [
        SidebarComponent,
        WelcomeComponent,
        TableViewerComponent,
        PipelineBuilderComponent,
        EditModeComponent,
        TutorialOverlayComponent,
        UpdateBannerComponent,
        UpdateCheckModalComponent,
        CreateTableModalComponent,
        TableSettingsModalComponent,
        ViewModalComponent,
        TriggerModalComponent,
    ],
    templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)
    private readonly sessionSvc = inject(SessionService)
    private readonly menuSvc = inject(MenuService)
    private readonly updaterSvc = inject(UpdaterService)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly isRestoring = signal(true)
    protected readonly tabs: ('browse' | 'query' | 'edit')[] = ['browse', 'query', 'edit']

    constructor() {
        // Autosave: re-runs whenever any tracked signal changes, debounced to 500ms.
        effect(() => {
            const session = this.sessionSvc.buildSession()
            if (session) {
                untracked(() => this.sessionSvc.debouncedSave(session))
            }
        })
    }

    async ngOnInit(): Promise<void> {
        await Promise.all([this.menuSvc.register(), this.sessionSvc.restore()])
        this.isRestoring.set(false)
        void this.updaterSvc.checkForUpdate()
        this.updaterSvc.startPolling()
    }
}
