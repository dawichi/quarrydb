import { Component, inject } from '@angular/core'
import { WorkspaceStore } from './core/store/workspace.store'
import { SidebarComponent } from './layout/sidebar/sidebar.component'
import { WelcomeComponent } from './features/welcome/welcome.component'
import { TableViewerComponent } from './features/table-viewer/table-viewer.component'

@Component({
    selector: 'app-root',
    imports: [SidebarComponent, WelcomeComponent, TableViewerComponent],
    templateUrl: './app.component.html',
})
export class AppComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)
}
