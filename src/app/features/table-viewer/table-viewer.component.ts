import { Component, computed, inject, signal } from '@angular/core'
import type { ForeignKey } from '@quarrydb/shared'
import type { ExportFormat } from '../../core/services/export.service'
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
    protected readonly showExportMenu = signal(false)

    // ─── Computed ─────────────────────────────────────────────────────────────
    protected readonly fkMap = computed<Map<string, ForeignKey>>(() => {
        const map = new Map<string, ForeignKey>()
        for (const fk of this.store.selectedTableFks()) {
            map.set(fk.column, fk)
        }
        return map
    })

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

    protected navigateToRef(fk: ForeignKey, value: unknown, event: MouseEvent): void {
        event.stopPropagation()
        void this.store.navigateToReference(fk.referencesTable, fk.referencesColumn, value)
    }

    protected navigateBack(index: number): void {
        void this.store.navigateBack(index)
    }

    protected exportAs(format: ExportFormat): void {
        this.showExportMenu.set(false)
        void this.store.exportTable(format)
    }

    private flash(key: string): void {
        this.copiedKey.set(key)
        setTimeout(() => this.copiedKey.set(null), 1000)
    }
}
