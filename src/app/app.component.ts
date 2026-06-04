import { Component, inject } from '@angular/core'
import { WorkspaceStore } from './core/store/workspace.store'
import { SidebarComponent } from './layout/sidebar/sidebar.component'
import { WelcomeComponent } from './features/welcome/welcome.component'

@Component({
    selector: 'app-root',
    imports: [SidebarComponent, WelcomeComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
})
export class AppComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)
}
