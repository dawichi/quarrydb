import { Component, inject } from '@angular/core'
import { WorkspaceStore } from '../../core/store/workspace.store'

@Component({
    selector: 'app-welcome',
    templateUrl: './welcome.component.html',
})
export class WelcomeComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)
}
