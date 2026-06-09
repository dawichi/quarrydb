import { Component, computed, inject, signal } from '@angular/core'
import { WorkspaceStore } from '../../core/store/workspace.store'
import { type AddColumnDef, buildAddColumnSql, buildRenameColumnSql, buildRenameTableSql } from './alter-table.utils'
import { buildCreateIndexSql } from './index.utils'

@Component({
    selector: 'app-table-settings-modal',
    templateUrl: './table-settings-modal.component.html',
})
export class TableSettingsModalComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly view = signal<
        'settings' | 'drop' | 'create-index' | 'drop-index' | 'add-column' | 'rename-column' | 'rename-table'
    >('settings')

    // Drop table
    protected readonly confirmName = signal('')
    protected readonly isDropping = signal(false)
    protected readonly dropError = signal<string | null>(null)

    // Create index
    protected readonly idxName = signal('')
    protected readonly idxColumns = signal<string[]>([])
    protected readonly idxUnique = signal(false)
    protected readonly isIndexing = signal(false)
    protected readonly indexError = signal<string | null>(null)

    // Drop index
    protected readonly dropIndexTarget = signal<string | null>(null)

    // Alter table (add column / rename column / rename table)
    protected readonly alterColTarget = signal<string | null>(null)
    protected readonly alterNewName = signal('')
    protected readonly alterColName = signal('')
    protected readonly alterColType = signal('TEXT')
    protected readonly alterColNotNull = signal(false)
    protected readonly alterColDefault = signal('')
    protected readonly isAltering = signal(false)
    protected readonly alterError = signal<string | null>(null)

    protected readonly COLUMN_TYPES = ['TEXT', 'INTEGER', 'REAL', 'BLOB', 'NUMERIC'] as const

    // ─── Computed ─────────────────────────────────────────────────────────────
    protected readonly tableColumns = computed(() => {
        const t = this.workspaceStore.tableSettingsTarget()
        if (!t) return []
        return (
            this.workspaceStore
                .schemas()
                .find((s) => s.alias === t.alias)
                ?.tables.find((table) => table.name === t.tableName)?.columns ?? []
        )
    })

    protected readonly tableIndexes = computed(() => {
        const t = this.workspaceStore.tableSettingsTarget()
        if (!t) return []
        return (
            this.workspaceStore
                .schemas()
                .find((s) => s.alias === t.alias)
                ?.tables.find((table) => table.name === t.tableName)?.indexes ?? []
        )
    })

    protected readonly totalImpactRows = computed(() => {
        const imp = this.workspaceStore.tableImpact()
        if (!imp) return 0
        return imp.rowCount + imp.cascadeNodes.reduce((sum, n) => sum + n.rowCount, 0)
    })

    protected readonly canDrop = computed(() => {
        const t = this.workspaceStore.tableSettingsTarget()
        return t !== null && this.confirmName() === t.tableName && !this.isDropping()
    })

    protected readonly generatedIndexSql = computed(() => {
        const t = this.workspaceStore.tableSettingsTarget()
        if (!t || !this.idxName().trim() || this.idxColumns().length === 0) return ''
        return buildCreateIndexSql(t.tableName, this.idxName().trim(), this.idxColumns(), this.idxUnique())
    })

    protected readonly canCreateIndex = computed(
        () => this.idxName().trim().length > 0 && this.idxColumns().length > 0 && !this.isIndexing(),
    )

    protected readonly activeDropIndex = computed(() => {
        const name = this.dropIndexTarget()
        return this.tableIndexes().find((i) => i.name === name) ?? null
    })

    protected readonly generatedAddColumnSql = computed(() => {
        const t = this.workspaceStore.tableSettingsTarget()
        const name = this.alterColName().trim()
        if (!t || !name) return ''
        const col: AddColumnDef = {
            name,
            type: this.alterColType(),
            notNull: this.alterColNotNull(),
            defaultValue: this.alterColDefault(),
        }
        return buildAddColumnSql(t.tableName, col)
    })

    protected readonly generatedRenameColumnSql = computed(() => {
        const t = this.workspaceStore.tableSettingsTarget()
        const oldName = this.alterColTarget()
        const newName = this.alterNewName().trim()
        if (!t || !oldName || !newName || newName === oldName) return ''
        return buildRenameColumnSql(t.tableName, oldName, newName)
    })

    protected readonly generatedRenameTableSql = computed(() => {
        const t = this.workspaceStore.tableSettingsTarget()
        const newName = this.alterNewName().trim()
        if (!t || !newName || newName === t.tableName) return ''
        return buildRenameTableSql(t.tableName, newName)
    })

    protected readonly canAddColumn = computed(() => this.alterColName().trim().length > 0 && !this.isAltering())

    protected readonly canRenameColumn = computed(() => {
        const newName = this.alterNewName().trim()
        return newName.length > 0 && newName !== this.alterColTarget() && !this.isAltering()
    })

    protected readonly canRenameTable = computed(() => {
        const t = this.workspaceStore.tableSettingsTarget()
        const newName = this.alterNewName().trim()
        return t !== null && newName.length > 0 && newName !== t.tableName && !this.isAltering()
    })

    // ─── Actions ──────────────────────────────────────────────────────────────
    protected showDropView(): void {
        this.view.set('drop')
    }

    protected showCreateIndex(): void {
        this.view.set('create-index')
    }

    protected showDropIndex(name: string): void {
        this.dropIndexTarget.set(name)
        this.view.set('drop-index')
    }

    protected showAddColumn(): void {
        this.view.set('add-column')
    }

    protected showRenameColumn(colName: string): void {
        this.alterColTarget.set(colName)
        this.alterNewName.set(colName)
        this.view.set('rename-column')
    }

    protected showRenameTable(): void {
        const t = this.workspaceStore.tableSettingsTarget()
        this.alterNewName.set(t?.tableName ?? '')
        this.view.set('rename-table')
    }

    protected backToSettings(): void {
        this.view.set('settings')
        this.confirmName.set('')
        this.dropError.set(null)
        this.dropIndexTarget.set(null)
        this.idxName.set('')
        this.idxColumns.set([])
        this.idxUnique.set(false)
        this.isIndexing.set(false)
        this.indexError.set(null)
        this.alterColTarget.set(null)
        this.alterNewName.set('')
        this.alterColName.set('')
        this.alterColType.set('TEXT')
        this.alterColNotNull.set(false)
        this.alterColDefault.set('')
        this.isAltering.set(false)
        this.alterError.set(null)
    }

    protected close(): void {
        if (this.isDropping() || this.isIndexing() || this.isAltering()) return
        this.workspaceStore.closeTableSettings()
        this.reset()
    }

    protected toggleIdxColumn(col: string): void {
        this.idxColumns.update((cols) => (cols.includes(col) ? cols.filter((c) => c !== col) : [...cols, col]))
    }

    protected async createIndex(): Promise<void> {
        const t = this.workspaceStore.tableSettingsTarget()
        const sql = this.generatedIndexSql()
        if (!t || !sql || !this.canCreateIndex()) return

        this.isIndexing.set(true)
        this.indexError.set(null)
        try {
            await this.workspaceStore.createIndex(t.alias, sql)
            this.backToSettings()
        } catch (err) {
            this.indexError.set(err instanceof Error ? err.message : 'Failed to create index')
        } finally {
            this.isIndexing.set(false)
        }
    }

    protected async addColumn(): Promise<void> {
        const t = this.workspaceStore.tableSettingsTarget()
        const sql = this.generatedAddColumnSql()
        if (!t || !sql || !this.canAddColumn()) return

        this.isAltering.set(true)
        this.alterError.set(null)
        try {
            await this.workspaceStore.alterAddColumn(t.alias, sql)
            this.backToSettings()
        } catch (err) {
            this.alterError.set(err instanceof Error ? err.message : 'Failed to add column')
        } finally {
            this.isAltering.set(false)
        }
    }

    protected async renameColumn(): Promise<void> {
        const t = this.workspaceStore.tableSettingsTarget()
        const sql = this.generatedRenameColumnSql()
        if (!t || !sql || !this.canRenameColumn()) return

        this.isAltering.set(true)
        this.alterError.set(null)
        try {
            await this.workspaceStore.alterRenameColumn(t.alias, sql)
            this.backToSettings()
        } catch (err) {
            this.alterError.set(err instanceof Error ? err.message : 'Failed to rename column')
        } finally {
            this.isAltering.set(false)
        }
    }

    protected async renameTable(): Promise<void> {
        const t = this.workspaceStore.tableSettingsTarget()
        const newName = this.alterNewName().trim()
        if (!t || !newName || !this.canRenameTable()) return

        this.isAltering.set(true)
        this.alterError.set(null)
        try {
            await this.workspaceStore.alterRenameTable(t.alias, t.tableName, newName)
            this.backToSettings()
        } catch (err) {
            this.alterError.set(err instanceof Error ? err.message : 'Failed to rename table')
        } finally {
            this.isAltering.set(false)
        }
    }

    protected async dropIndex(): Promise<void> {
        const t = this.workspaceStore.tableSettingsTarget()
        const name = this.dropIndexTarget()
        if (!t || !name) return

        this.isIndexing.set(true)
        this.indexError.set(null)
        try {
            await this.workspaceStore.dropIndex(t.alias, name)
            this.backToSettings()
        } catch (err) {
            this.indexError.set(err instanceof Error ? err.message : 'Failed to drop index')
        } finally {
            this.isIndexing.set(false)
        }
    }

    protected async drop(): Promise<void> {
        const t = this.workspaceStore.tableSettingsTarget()
        if (!t || !this.canDrop()) return

        this.isDropping.set(true)
        this.dropError.set(null)
        try {
            await this.workspaceStore.dropTable(t.alias, t.tableName)
            this.workspaceStore.closeTableSettings()
            this.reset()
        } catch (err) {
            this.dropError.set(err instanceof Error ? err.message : 'Failed to drop table')
        } finally {
            this.isDropping.set(false)
        }
    }

    protected onConfirmInput(event: Event): void {
        this.confirmName.set((event.target as HTMLInputElement).value)
    }

    protected formatCount(n: number): string {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
        return String(n)
    }

    // ─── Private ──────────────────────────────────────────────────────────────
    private reset(): void {
        this.view.set('settings')
        this.confirmName.set('')
        this.dropError.set(null)
        this.dropIndexTarget.set(null)
        this.idxName.set('')
        this.idxColumns.set([])
        this.idxUnique.set(false)
        this.isIndexing.set(false)
        this.indexError.set(null)
        this.alterColTarget.set(null)
        this.alterNewName.set('')
        this.alterColName.set('')
        this.alterColType.set('TEXT')
        this.alterColNotNull.set(false)
        this.alterColDefault.set('')
        this.isAltering.set(false)
        this.alterError.set(null)
    }
}
