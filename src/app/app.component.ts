import { Component, OnInit, effect, inject, signal, untracked } from '@angular/core'
import { MenuService } from './core/services/menu.service'
import { SessionService } from './core/services/session.service'
import { WorkspaceStore } from './core/store/workspace.store'
import { EditModeComponent } from './features/edit-mode/edit-mode.component'
import { PipelineBuilderComponent } from './features/pipeline-builder/pipeline-builder.component'
import { TableViewerComponent } from './features/table-viewer/table-viewer.component'
import { TutorialOverlayComponent } from './features/tutorial/tutorial-overlay.component'
import { WelcomeComponent } from './features/welcome/welcome.component'
import { SidebarComponent } from './layout/sidebar/sidebar.component'

@Component({
    selector: 'app-root',
    imports: [SidebarComponent, WelcomeComponent, TableViewerComponent, PipelineBuilderComponent, EditModeComponent, TutorialOverlayComponent],
    templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)
    private readonly sessionSvc = inject(SessionService)
    private readonly menuSvc = inject(MenuService)

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
    }
}
