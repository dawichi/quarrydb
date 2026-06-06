import { Component, computed, inject, signal } from '@angular/core'
import { EditStore } from '../../core/store/edit.store'
import { WorkspaceStore } from '../../core/store/workspace.store'
import { AutofocusDirective } from '../../shared/directives/autofocus.directive'

@Component({
    selector: 'app-edit-mode',
    imports: [AutofocusDirective],
    host: { class: 'flex-1 min-h-0 flex flex-col overflow-hidden' },
    templateUrl: './edit-mode.component.html',
})
export class EditModeComponent {
    protected readonly store = inject(WorkspaceStore)
    protected readonly editStore = inject(EditStore)

    protected readonly editingCell = signal<{ rowIndex: number; col: string } | null>(null)
    protected readonly editValue = signal('')
    protected readonly showInsertForm = signal(false)
    protected readonly insertValues = signal<Record<string, string>>({})

    protected readonly pkColumns = computed(() => {
        const sel = this.store.selectedTable()
        if (!sel) return []
        const schema = this.store.schemas().find((s) => s.alias === sel.schemaAlias)
        return (
            schema?.tables
                .find((t) => t.name === sel.tableName)
                ?.columns.filter((c) => c.primaryKey)
                .map((c) => c.name) ?? []
        )
    })

    protected readonly editableColumns = computed(() => {
        const sel = this.store.selectedTable()
        if (!sel) return []
        const schema = this.store.schemas().find((s) => s.alias === sel.schemaAlias)
        return (
            schema?.tables
                .find((t) => t.name === sel.tableName)
                ?.columns.filter((c) => !c.primaryKey)
                .map((c) => c.name) ?? []
        )
    })

    protected getPkValues(row: Record<string, unknown>): Record<string, unknown> {
        return Object.fromEntries(this.pkColumns().map((pk) => [pk, row[pk]]))
    }

    protected startEdit(rowIndex: number, col: string, currentValue: unknown): void {
        if (this.pkColumns().includes(col)) return
        const row = this.store.tableRows()[rowIndex]
        if (this.editStore.isRowDeleted(this.getPkValues(row))) return
        this.editingCell.set({ rowIndex, col })
        this.editValue.set(currentValue === null || currentValue === undefined ? '' : String(currentValue))
    }

    protected commitEdit(rowIndex: number, col: string): void {
        const cell = this.editingCell()
        if (!cell || cell.rowIndex !== rowIndex || cell.col !== col) return
        const row = this.store.tableRows()[rowIndex]
        const pkValues = this.getPkValues(row)
        const originalValue = row[col]
        const newValue = this.parseValue(this.editValue(), originalValue)
        if (newValue !== originalValue) {
            this.editStore.stageUpdate(pkValues, col, newValue, row)
        }
        this.editingCell.set(null)
    }

    protected cancelEdit(): void {
        this.editingCell.set(null)
    }

    protected stageDelete(rowIndex: number): void {
        const row = this.store.tableRows()[rowIndex]
        this.editStore.stageDelete(this.getPkValues(row), row)
    }

    protected unstageDelete(rowIndex: number): void {
        const row = this.store.tableRows()[rowIndex]
        this.editStore.unstageDelete(this.getPkValues(row))
    }

    protected openInsertForm(): void {
        this.insertValues.set(Object.fromEntries(this.editableColumns().map((col) => [col, ''])))
        this.showInsertForm.set(true)
    }

    protected setInsertValue(col: string, event: Event): void {
        const value = (event.target as HTMLInputElement).value
        this.insertValues.update((v) => ({ ...v, [col]: value }))
    }

    protected stageInsert(): void {
        const vals = this.insertValues()
        if (Object.values(vals).every((v) => v === '')) return
        this.editStore.stageInsert({ ...vals })
        this.insertValues.set(Object.fromEntries(this.editableColumns().map((col) => [col, ''])))
    }

    protected cancelInsert(): void {
        this.showInsertForm.set(false)
    }

    protected isEditing(rowIndex: number, col: string): boolean {
        const cell = this.editingCell()
        return cell?.rowIndex === rowIndex && cell?.col === col
    }

    protected isNull(value: unknown): boolean {
        return value === null || value === undefined
    }

    protected formatCell(value: unknown): string {
        if (value === null || value === undefined) return ''
        if (typeof value === 'object') return JSON.stringify(value)
        return String(value)
    }

    protected getDisplayValue(row: Record<string, unknown>, col: string): unknown {
        const update = this.editStore.getRowUpdate(this.getPkValues(row))
        return update?.changes[col] !== undefined ? update.changes[col] : row[col]
    }

    protected isCellModified(row: Record<string, unknown>, col: string): boolean {
        const update = this.editStore.getRowUpdate(this.getPkValues(row))
        return update?.changes[col] !== undefined
    }

    protected isRowModified(row: Record<string, unknown>): boolean {
        return this.editStore.getRowUpdate(this.getPkValues(row)) !== null
    }

    protected isRowDeleted(row: Record<string, unknown>): boolean {
        return this.editStore.isRowDeleted(this.getPkValues(row))
    }

    protected formatPk(pkValues: Record<string, unknown>): string {
        return Object.entries(pkValues)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')
    }

    protected formatChanges(changes: Record<string, unknown>): string {
        return Object.entries(changes)
            .map(([k, v]) => `${k} → ${v}`)
            .join(', ')
    }

    protected async applyAll(): Promise<void> {
        const sel = this.store.selectedTable()
        if (!sel) return
        const path = this.store.schemas().find((s) => s.alias === sel.schemaAlias)?.path
        if (!path) return
        const success = await this.editStore.applyAll(path, sel.tableName)
        if (success) await this.store.selectTable(sel.schemaAlias, sel.tableName)
    }

    private parseValue(raw: string, original: unknown): unknown {
        if (raw === '' && (original === null || original === undefined)) return null
        if (typeof original === 'number') {
            const n = Number(raw)
            return Number.isNaN(n) ? raw : n
        }
        return raw
    }
}
