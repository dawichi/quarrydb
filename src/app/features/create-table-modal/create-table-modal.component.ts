import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import type { TableSchema } from '@quarrydb/shared'
import { SqliteDatabaseService } from '../../core/services/sqlite-database.service'
import { describeSqliteError } from '../../core/services/sqlite-error'
import { SqliteWorkspaceStore } from '../../core/store/sqlite-workspace.store'
import { type ColumnDef, type ForeignKeyRef, generateCreateTableSql, makeColumn, SQL_TYPES } from './create-table.utils'

interface DropdownState {
    colId: string
    kind: 'type' | 'fk-table' | 'fk-col'
    top: number
    left: number
    width: number
}

@Component({
    selector: 'app-create-table-modal',
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './create-table-modal.component.html',
})
export class CreateTableModalComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(SqliteWorkspaceStore)
    private readonly db = inject(SqliteDatabaseService)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly tableName = signal('')
    protected readonly columns = signal<ColumnDef[]>([
        { ...makeColumn(), name: 'id', type: 'INTEGER', primaryKey: true },
    ])
    protected readonly isCreating = signal(false)
    protected readonly createError = signal<string | null>(null)
    protected readonly sqlTypes = SQL_TYPES
    protected readonly openDropdown = signal<DropdownState | null>(null)

    // ─── Computed ─────────────────────────────────────────────────────────────
    protected readonly availableTables = computed<TableSchema[]>(() => {
        const target = this.workspaceStore.createTableTarget()
        if (!target) return []
        return this.workspaceStore.schemas().find((s) => s.alias === target.alias)?.tables ?? []
    })

    protected readonly tableNameExists = computed(() => {
        const target = this.workspaceStore.createTableTarget()
        const name = this.tableName().trim().toLowerCase()
        if (!target || !name) return false
        return this.availableTables().some((t) => t.name.toLowerCase() === name)
    })

    protected readonly validationError = computed<string | null>(() => {
        const name = this.tableName().trim()
        const cols = this.columns()
        if (!name) return 'Table name is required'
        if (cols.length === 0) return 'Add at least one column'
        if (cols.some((c) => !c.name.trim() || !c.type.trim())) return 'All columns need a name and type'
        const names = cols.map((c) => c.name.trim().toLowerCase())
        if (new Set(names).size !== names.length) return 'Column names must be unique'
        if (cols.some((c) => c.foreignKey !== null && (!c.foreignKey.table || !c.foreignKey.column))) {
            return 'Complete all foreign key references'
        }
        return null
    })

    protected readonly isValid = computed(() => this.validationError() === null && !this.tableNameExists())

    protected readonly generatedSql = computed(() => {
        const name = this.tableName().trim()
        const cols = this.columns()
        if (!name || cols.length === 0) return ''
        return generateCreateTableSql(name, cols)
    })

    // ─── Column Mutation Methods ──────────────────────────────────────────────
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

    protected onDefaultInput(id: string, event: Event): void {
        this.updateColumn(id, { defaultValue: (event.target as HTMLInputElement).value })
    }

    protected toggleFk(colId: string): void {
        const col = this.columns().find((c) => c.id === colId)
        if (!col) return
        this.updateColumn(colId, { foreignKey: col.foreignKey ? null : { table: '', column: '' } })
    }

    // ─── Dropdown Methods ─────────────────────────────────────────────────────
    protected openTypeDropdown(colId: string, event: MouseEvent): void {
        this.positionAndOpen(colId, 'type', event.currentTarget as HTMLElement)
    }

    protected openFkTableDropdown(colId: string, event: MouseEvent): void {
        this.positionAndOpen(colId, 'fk-table', event.currentTarget as HTMLElement)
    }

    protected openFkColDropdown(colId: string, event: MouseEvent): void {
        this.positionAndOpen(colId, 'fk-col', event.currentTarget as HTMLElement)
    }

    protected closeDropdown(): void {
        this.openDropdown.set(null)
    }

    protected selectType(type: string): void {
        const d = this.openDropdown()
        if (!d) return
        this.updateColumn(d.colId, { type })
        this.openDropdown.set(null)
    }

    protected selectFkTable(table: string): void {
        const d = this.openDropdown()
        if (!d) return
        const col = this.columns().find((c) => c.id === d.colId)
        const prevCol = col?.foreignKey?.column ?? ''
        this.updateColumn(d.colId, { foreignKey: { table, column: prevCol } })
        this.openDropdown.set(null)
    }

    protected selectFkCol(column: string): void {
        const d = this.openDropdown()
        if (!d) return
        const col = this.columns().find((c) => c.id === d.colId)
        if (!col?.foreignKey) return
        this.updateColumn(d.colId, { foreignKey: { ...col.foreignKey, column } })
        this.openDropdown.set(null)
    }

    protected getFkTableColumns(tableName: string) {
        return this.availableTables().find((t) => t.name === tableName)?.columns ?? []
    }

    protected getActiveColFk(): ForeignKeyRef | null {
        const d = this.openDropdown()
        if (!d) return null
        return this.columns().find((c) => c.id === d.colId)?.foreignKey ?? null
    }

    protected getActiveColType(): string {
        const d = this.openDropdown()
        if (!d) return ''
        return this.columns().find((c) => c.id === d.colId)?.type ?? ''
    }

    // ─── Modal Actions ────────────────────────────────────────────────────────
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
            this.createError.set(describeSqliteError(err, 'Failed to create table'))
        } finally {
            this.isCreating.set(false)
        }
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────
    private reset(): void {
        this.tableName.set('')
        this.columns.set([{ ...makeColumn(), name: 'id', type: 'INTEGER', primaryKey: true }])
        this.createError.set(null)
        this.openDropdown.set(null)
    }

    private positionAndOpen(colId: string, kind: DropdownState['kind'], trigger: HTMLElement): void {
        const rect = trigger.getBoundingClientRect()
        this.openDropdown.set({ colId, kind, top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
}
