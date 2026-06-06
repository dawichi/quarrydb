import { Component, inject, signal } from '@angular/core'
import { WorkspaceStore } from '../../core/store/workspace.store'

@Component({
    selector: 'app-table-viewer',
    imports: [],
    host: { class: 'flex-1 min-h-0' },
    templateUrl: './table-viewer.component.html',
})
export class TableViewerComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly store = inject(WorkspaceStore)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly copiedKey = signal<string | null>(null)

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

    protected async copyCell(rowIndex: number, col: string, value: unknown): Promise<void> {
        const text = value === null || value === undefined ? '' : String(value)
        await navigator.clipboard.writeText(text)
        this.flash(`${rowIndex}-${col}`)
    }

    protected async copyRow(rowIndex: number, row: Record<string, unknown>): Promise<void> {
        await navigator.clipboard.writeText(JSON.stringify(row, null, 2))
        this.flash(`row-${rowIndex}`)
    }

    protected isCopied(key: string): boolean {
        return this.copiedKey() === key
    }

    protected toggleSort(col: string): void {
        void this.store.toggleBrowseSort(col)
    }

    private flash(key: string): void {
        this.copiedKey.set(key)
        setTimeout(() => this.copiedKey.set(null), 1000)
    }
}
