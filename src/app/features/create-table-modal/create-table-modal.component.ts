import { Component, computed, inject, signal } from '@angular/core'
import { DatabaseService } from '../../core/services/database.service'
import { WorkspaceStore } from '../../core/store/workspace.store'
import { type ColumnDef, generateCreateTableSql, makeColumn, SQL_TYPES } from './create-table.utils'

@Component({
    selector: 'app-create-table-modal',
    templateUrl: './create-table-modal.component.html',
})
export class CreateTableModalComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)
    private readonly db = inject(DatabaseService)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly tableName = signal('')
    protected readonly columns = signal<ColumnDef[]>([
        { ...makeColumn(), name: 'id', type: 'INTEGER', primaryKey: true },
    ])
    protected readonly isCreating = signal(false)
    protected readonly createError = signal<string | null>(null)
    protected readonly sqlTypes = SQL_TYPES

    // ─── Computed ─────────────────────────────────────────────────────────────
    protected readonly validationError = computed<string | null>(() => {
        const name = this.tableName().trim()
        const cols = this.columns()
        if (!name) return 'Table name is required'
        if (cols.length === 0) return 'Add at least one column'
        if (cols.some((c) => !c.name.trim() || !c.type.trim())) return 'All columns need a name and type'
        const names = cols.map((c) => c.name.trim().toLowerCase())
        if (new Set(names).size !== names.length) return 'Column names must be unique'
        return null
    })

    protected readonly isValid = computed(() => this.validationError() === null)

    protected readonly generatedSql = computed(() => {
        const name = this.tableName().trim()
        const cols = this.columns()
        if (!name || cols.length === 0) return ''
        return generateCreateTableSql(name, cols)
    })

    // ─── Public Methods ───────────────────────────────────────────────────────
    protected addColumn(): void {
        this.columns.update((cols) => [...cols, makeColumn()])
    }

    protected removeColumn(id: string): void {
        this.columns.update((cols) => cols.filter((c) => c.id !== id))
    }

    protected updateColumn(id: string, patch: Partial<ColumnDef>): void {
        this.columns.update((cols) => cols.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    }

    protected onNameInput(id: string, event: Event): void {
        this.updateColumn(id, { name: (event.target as HTMLInputElement).value })
    }

    protected onTypeChange(id: string, event: Event): void {
        this.updateColumn(id, { type: (event.target as HTMLSelectElement).value })
    }

    protected onDefaultInput(id: string, event: Event): void {
        this.updateColumn(id, { defaultValue: (event.target as HTMLInputElement).value })
    }

    protected close(): void {
        if (this.isCreating()) return
        this.workspaceStore.closeCreateTable()
        this.reset()
    }

    protected async create(): Promise<void> {
        const target = this.workspaceStore.createTableTarget()
        if (!target || !this.isValid() || this.isCreating()) return
        const sql = this.generatedSql()
        if (!sql) return

        this.isCreating.set(true)
        this.createError.set(null)
        try {
            await this.db.runDdl(target.path, sql)
            await this.workspaceStore.reloadSchema(target.alias)
            this.workspaceStore.closeCreateTable()
            this.reset()
        } catch (err) {
            this.createError.set(err instanceof Error ? err.message : 'Failed to create table')
        } finally {
            this.isCreating.set(false)
        }
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────
    private reset(): void {
        this.tableName.set('')
        this.columns.set([{ ...makeColumn(), name: 'id', type: 'INTEGER', primaryKey: true }])
        this.createError.set(null)
    }
}
