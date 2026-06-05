import { Component, inject } from '@angular/core'
import { WorkspaceStore } from './core/store/workspace.store'
import { SidebarComponent } from './layout/sidebar/sidebar.component'
import { WelcomeComponent } from './features/welcome/welcome.component'
import { TableViewerComponent } from './features/table-viewer/table-viewer.component'
import { PipelineBuilderComponent } from './features/pipeline-builder/pipeline-builder.component'

@Component({
    selector: 'app-root',
    imports: [SidebarComponent, WelcomeComponent, TableViewerComponent, PipelineBuilderComponent],
    templateUrl: './app.component.html',
})
export class AppComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly tabs: ('browse' | 'query')[] = ['browse', 'query']
}
