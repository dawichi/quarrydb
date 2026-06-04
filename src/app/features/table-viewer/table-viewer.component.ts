import { Component, inject } from '@angular/core'
import { WorkspaceStore } from '../../core/store/workspace.store'

@Component({
    selector: 'app-table-viewer',
    imports: [],
    templateUrl: './table-viewer.component.html',
})
export class TableViewerComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly store = inject(WorkspaceStore)

    // ─── Public Methods ───────────────────────────────────────────────────────
    protected isNull(value: unknown): boolean {
        return value === null || value === undefined
    }

    protected formatCell(value: unknown): string {
        if (typeof value === 'object') return JSON.stringify(value)
        return String(value)
    }

    protected formatTotal(n: number): string {
        return n.toLocaleString()
    }
}
