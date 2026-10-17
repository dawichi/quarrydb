import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    inject,
    OnDestroy,
    OnInit,
    signal,
    untracked,
} from '@angular/core'
import { sqlitePipelineBackend } from './core/providers/pipeline-backends'
import { MenuService } from './core/services/menu.service'
import { SessionService } from './core/services/session.service'
import { SqliteDatabaseService } from './core/services/sqlite-database.service'
import { TutorialService } from './core/services/tutorial.service'
import { UpdaterService } from './core/services/updater.service'
import type { PipelineTarget } from './core/store/pipeline-backend'
import { SqliteWorkspaceStore } from './core/store/sqlite-workspace.store'
import { WorkspaceHostStore } from './core/store/workspace-host.store'
import { CreateTableModalComponent } from './features/create-table-modal/create-table-modal.component'
import { EditModeComponent } from './features/edit-mode/edit-mode.component'
import { MysqlWorkspaceComponent } from './features/mysql-workspace/mysql-workspace.component'
import { PipelineBuilderComponent } from './features/pipeline-builder/pipeline-builder.component'
import { RedisWorkspaceComponent } from './features/redis-workspace/redis-workspace.component'
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
        MysqlWorkspaceComponent,
        RedisWorkspaceComponent,
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
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './app.component.html',
})
export class AppComponent implements OnDestroy, OnInit {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceHost = inject(WorkspaceHostStore)
    protected readonly workspaceStore = inject(SqliteWorkspaceStore)
    private readonly sessionSvc = inject(SessionService)
    private readonly menuSvc = inject(MenuService)
    protected readonly tutorialSvc = inject(TutorialService)
    protected readonly updaterSvc = inject(UpdaterService)
    private readonly sqliteDb = inject(SqliteDatabaseService)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly isRestoring = signal(true)
    protected readonly tabs: ('browse' | 'query' | 'edit')[] = ['browse', 'query', 'edit']

    /** The SQLite table the pipeline builder works on. */
    protected readonly sqlitePipelineTarget = computed<PipelineTarget | null>(() => {
        const selected = this.workspaceStore.selectedTable()
        if (!selected) return null
        const schema = this.workspaceStore.schemas().find((s) => s.alias === selected.schemaAlias)
        const table = schema?.tables.find((t) => t.name === selected.tableName)
        if (!schema || !table) return null
        const { path, alias } = schema
        return {
            backend: sqlitePipelineBackend(this.sqliteDb, path, alias, () =>
                this.workspaceStore.schemas().find((s) => s.path === path),
            ),
            tableName: table.name,
            columns: table.columns.map((c) => c.name),
        }
    })

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

    ngOnDestroy(): void {
        this.updaterSvc.stopPolling()
    }
}
