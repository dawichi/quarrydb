import { computed, Injectable, inject, signal } from '@angular/core'
import type { DatabaseSchema, ForeignKey, TriggerSchema, ViewSchema, Workspace } from '@quarrydb/shared'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import { save } from '@tauri-apps/plugin-dialog'
import { type ExportFormat, ExportService } from '../services/export.service'
import { RecentItemsService } from '../services/recent-items.service'
import { SqliteDatabaseService, type TableImpact } from '../services/sqlite-database.service'
import { describeSqliteError } from '../services/sqlite-error'
import { SqliteSampleDatabaseService } from '../services/sqlite-sample-database.service'
import { WorkspaceHostStore } from './workspace-host.store'

interface SelectedTable {
    schemaAlias: string
    tableName: string
}

interface BrowseFilter {
    col: string
    value: unknown
}

interface BrowseNavEntry {
    alias: string
    tableName: string
    filter: BrowseFilter | null
    label: string
}

@Injectable({ providedIn: 'root' })
export class SqliteWorkspaceStore {
    // ─── Injected Services ────────────────────────────────────────────────────
    private readonly host = inject(WorkspaceHostStore)
    private readonly db = inject(SqliteDatabaseService)
    private readonly sampleDb = inject(SqliteSampleDatabaseService)
    private readonly exportSvc = inject(ExportService)
    private readonly recentItemsSvc = inject(RecentItemsService)

    // ─── Private ──────────────────────────────────────────────────────────────
    private readonly PAGE_SIZE = 100
    private loadOffset = 0

    // ─── State ────────────────────────────────────────────────────────────────
    readonly workspace = signal<Workspace | null>(null)
    readonly schemas = signal<DatabaseSchema[]>([])
    readonly isLoading = this.host.isLoading
    readonly error = this.host.error

    readonly selectedTable = signal<SelectedTable | null>(null)
    readonly tableRows = signal<Record<string, unknown>[]>([])
    readonly tableColumns = signal<string[]>([])
    readonly tableRowTotal = signal<number>(0)
    readonly isLoadingTable = signal(false)
    readonly isExporting = signal(false)
    readonly browseSortCol = signal<string | null>(null)
    readonly browseSortDir = signal<'ASC' | 'DESC'>('ASC')

    readonly activeTab = signal<'browse' | 'query' | 'edit'>('browse')
    readonly createTableTarget = signal<{ alias: string; path: string } | null>(null)
    readonly tableSettingsTarget = signal<{ alias: string; tableName: string } | null>(null)
    readonly tableImpact = signal<TableImpact | null>(null)
    readonly isLoadingImpact = signal(false)
    readonly browseFilter = signal<BrowseFilter | null>(null)
    readonly browseNavStack = signal<BrowseNavEntry[]>([])
    readonly viewModalTarget = signal<{ alias: string; view: ViewSchema | null } | null>(null)
    readonly triggerModalTarget = signal<{ alias: string; trigger: TriggerSchema | null } | null>(null)

    // ─── Computed ─────────────────────────────────────────────────────────────
    readonly hasWorkspace = computed(() => this.host.hasWorkspace())
    readonly hasMoreRows = computed(() => this.tableRows().length < this.tableRowTotal())
    readonly selectedTableFks = computed<ForeignKey[]>(() => {
        const sel = this.selectedTable()
        if (!sel) return []
        return (
            this.schemas()
                .find((s) => s.alias === sel.schemaAlias)
                ?.tables.find((t) => t.name === sel.tableName)?.foreignKeys ?? []
        )
    })

    // ─── Public Methods ───────────────────────────────────────────────────────
    setActiveTab(tab: 'browse' | 'query' | 'edit'): void {
        this.activeTab.set(tab)
    }

    openCreateTable(alias: string): void {
        const path = this.schemas().find((s) => s.alias === alias)?.path
        if (!path) return
        this.createTableTarget.set({ alias, path })
    }

    closeCreateTable(): void {
        this.createTableTarget.set(null)
    }

    openTableSettings(alias: string, tableName: string): void {
        this.tableSettingsTarget.set({ alias, tableName })
        this.tableImpact.set(null)
        void this.loadTableImpact(alias, tableName)
    }

    closeTableSettings(): void {
        this.tableSettingsTarget.set(null)
        this.tableImpact.set(null)
    }

    async createIndex(alias: string, sql: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdl(schema.path, sql)
        await this.reloadSchema(alias)
    }

    async dropIndex(alias: string, indexName: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdl(schema.path, `DROP INDEX "${indexName}"`)
        await this.reloadSchema(alias)
    }

    async alterAddColumn(alias: string, sql: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdl(schema.path, sql)
        await this.reloadSchema(alias)
        await this.reselectIfOpen(alias)
    }

    async alterRenameColumn(alias: string, sql: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdl(schema.path, sql)
        await this.reloadSchema(alias)
        await this.reselectIfOpen(alias)
    }

    async alterDropColumn(alias: string, statements: string[]): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdlScript(schema.path, statements)
        await this.reloadSchema(alias)
        await this.reselectIfOpen(alias)
    }

    async alterRenameTable(alias: string, oldName: string, newName: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdl(schema.path, `ALTER TABLE "${oldName}" RENAME TO "${newName}"`)
        await this.reloadSchema(alias)
        this.tableSettingsTarget.set({ alias, tableName: newName })
        const sel = this.selectedTable()
        if (sel?.schemaAlias === alias && sel?.tableName === oldName) {
            this.selectedTable.set({ schemaAlias: alias, tableName: newName })
        }
    }

    async dropTable(alias: string, tableName: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdl(schema.path, `DROP TABLE "${tableName}"`)
        await this.reloadSchema(alias)
        const sel = this.selectedTable()
        if (sel?.schemaAlias === alias && sel?.tableName === tableName) {
            this.selectedTable.set(null)
            this.tableRows.set([])
            this.tableColumns.set([])
            this.tableRowTotal.set(0)
        }
    }

    openCreateView(alias: string): void {
        this.viewModalTarget.set({ alias, view: null })
    }

    openEditView(alias: string, view: ViewSchema): void {
        this.viewModalTarget.set({ alias, view })
    }

    closeViewModal(): void {
        this.viewModalTarget.set(null)
    }

    openCreateTrigger(alias: string): void {
        this.triggerModalTarget.set({ alias, trigger: null })
    }

    openEditTrigger(alias: string, trigger: TriggerSchema): void {
        this.triggerModalTarget.set({ alias, trigger })
    }

    closeTriggerModal(): void {
        this.triggerModalTarget.set(null)
    }

    async createView(alias: string, name: string, selectSql: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdl(schema.path, `CREATE VIEW "${name}" AS ${selectSql}`)
        await this.reloadSchema(alias)
    }

    async editView(alias: string, oldName: string, name: string, selectSql: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdlScript(schema.path, [
            'BEGIN',
            `DROP VIEW "${oldName}"`,
            `CREATE VIEW "${name}" AS ${selectSql}`,
            'COMMIT',
        ])
        await this.reloadSchema(alias)
    }

    async dropView(alias: string, name: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdl(schema.path, `DROP VIEW "${name}"`)
        await this.reloadSchema(alias)
    }

    async createTrigger(alias: string, sql: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdl(schema.path, sql)
        await this.reloadSchema(alias)
    }

    async editTrigger(alias: string, oldName: string, sql: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdlScript(schema.path, ['BEGIN', `DROP TRIGGER "${oldName}"`, sql, 'COMMIT'])
        await this.reloadSchema(alias)
    }

    async dropTrigger(alias: string, name: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        await this.db.runDdl(schema.path, `DROP TRIGGER "${name}"`)
        await this.reloadSchema(alias)
    }

    async reloadSchema(alias: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        const updated = await this.db.loadSchema(schema.path, alias)
        this.schemas.update((schemas) => schemas.map((s) => (s.alias === alias ? updated : s)))
    }

    private async reselectIfOpen(alias: string): Promise<void> {
        const target = this.tableSettingsTarget()
        const sel = this.selectedTable()
        if (target && sel?.schemaAlias === alias && sel?.tableName === target.tableName) {
            await this.selectTable(alias, target.tableName)
        }
    }

    async selectTable(alias: string, tableName: string): Promise<void> {
        this.selectedTable.set({ schemaAlias: alias, tableName })
        this.tableRows.set([])
        this.tableColumns.set([])
        this.tableRowTotal.set(0)
        this.browseSortCol.set(null)
        this.browseSortDir.set('ASC')
        this.browseFilter.set(null)
        this.browseNavStack.set([])
        this.loadOffset = 0

        const path = this.schemas().find((s) => s.alias === alias)?.path
        if (!path) return

        this.isLoadingTable.set(true)
        try {
            const { rows, total } = await this.db.queryRows(path, tableName, this.PAGE_SIZE, 0)

            const schemaColumns =
                this.schemas()
                    .find((s) => s.alias === alias)
                    ?.tables.find((t) => t.name === tableName)
                    ?.columns.map((c) => c.name) ?? (rows.length > 0 ? Object.keys(rows[0]) : [])

            this.tableColumns.set(schemaColumns)
            this.tableRows.set(rows)
            this.tableRowTotal.set(total)
            this.loadOffset = rows.length
        } catch (err) {
            this.error.set(describeSqliteError(err, 'Failed to load table'))
        } finally {
            this.isLoadingTable.set(false)
        }
    }

    async loadMoreRows(): Promise<void> {
        const sel = this.selectedTable()
        if (!sel || this.isLoadingTable()) return

        const path = this.schemas().find((s) => s.alias === sel.schemaAlias)?.path
        if (!path) return

        this.isLoadingTable.set(true)
        try {
            const { rows } = await this.db.queryRows(
                path,
                sel.tableName,
                this.PAGE_SIZE,
                this.loadOffset,
                this.browseSortCol() ?? undefined,
                this.browseSortDir(),
                this.browseFilter() ?? undefined,
            )
            this.tableRows.update((prev) => [...prev, ...rows])
            this.loadOffset += rows.length
        } catch (err) {
            this.error.set(describeSqliteError(err, 'Failed to load more rows'))
        } finally {
            this.isLoadingTable.set(false)
        }
    }

    async toggleBrowseSort(col: string): Promise<void> {
        const sel = this.selectedTable()
        if (!sel || this.isLoadingTable()) return

        const path = this.schemas().find((s) => s.alias === sel.schemaAlias)?.path
        if (!path) return

        // Cycle: new col → ASC, same col ASC → DESC, same col DESC → unsorted
        if (this.browseSortCol() !== col) {
            this.browseSortCol.set(col)
            this.browseSortDir.set('ASC')
        } else if (this.browseSortDir() === 'ASC') {
            this.browseSortDir.set('DESC')
        } else {
            this.browseSortCol.set(null)
            this.browseSortDir.set('ASC')
        }

        this.tableRows.set([])
        this.loadOffset = 0
        this.isLoadingTable.set(true)
        try {
            const { rows, total } = await this.db.queryRows(
                path,
                sel.tableName,
                this.PAGE_SIZE,
                0,
                this.browseSortCol() ?? undefined,
                this.browseSortDir(),
                this.browseFilter() ?? undefined,
            )
            this.tableRows.set(rows)
            this.tableRowTotal.set(total)
            this.loadOffset = rows.length
        } catch (err) {
            this.error.set(describeSqliteError(err, 'Failed to sort table'))
        } finally {
            this.isLoadingTable.set(false)
        }
    }

    async navigateToReference(referencedTable: string, filterCol: string, filterValue: unknown): Promise<void> {
        const sel = this.selectedTable()
        if (!sel) return
        const path = this.schemas().find((s) => s.alias === sel.schemaAlias)?.path
        if (!path) return

        const currentFilter = this.browseFilter()
        const label = currentFilter ? `${sel.tableName} [${currentFilter.col} = ${currentFilter.value}]` : sel.tableName

        this.browseNavStack.update((stack) => [
            ...stack,
            { alias: sel.schemaAlias, tableName: sel.tableName, filter: currentFilter, label },
        ])

        this.selectedTable.set({ schemaAlias: sel.schemaAlias, tableName: referencedTable })
        this.tableRows.set([])
        this.tableColumns.set([])
        this.tableRowTotal.set(0)
        this.browseSortCol.set(null)
        this.browseSortDir.set('ASC')
        this.browseFilter.set({ col: filterCol, value: filterValue })
        this.loadOffset = 0

        this.isLoadingTable.set(true)
        try {
            const filter = { col: filterCol, value: filterValue }
            const { rows, total } = await this.db.queryRows(
                path,
                referencedTable,
                this.PAGE_SIZE,
                0,
                undefined,
                undefined,
                filter,
            )
            const schemaColumns =
                this.schemas()
                    .find((s) => s.alias === sel.schemaAlias)
                    ?.tables.find((t) => t.name === referencedTable)
                    ?.columns.map((c) => c.name) ?? (rows.length > 0 ? Object.keys(rows[0]) : [])
            this.tableColumns.set(schemaColumns)
            this.tableRows.set(rows)
            this.tableRowTotal.set(total)
            this.loadOffset = rows.length
        } catch (err) {
            this.error.set(describeSqliteError(err, 'Failed to navigate to reference'))
        } finally {
            this.isLoadingTable.set(false)
        }
    }

    async navigateBack(index: number): Promise<void> {
        const stack = this.browseNavStack()
        const target = stack[index]
        if (!target) return

        const path = this.schemas().find((s) => s.alias === target.alias)?.path
        if (!path) return

        this.selectedTable.set({ schemaAlias: target.alias, tableName: target.tableName })
        this.tableRows.set([])
        this.tableColumns.set([])
        this.tableRowTotal.set(0)
        this.browseSortCol.set(null)
        this.browseSortDir.set('ASC')
        this.browseFilter.set(target.filter)
        this.browseNavStack.set(stack.slice(0, index))
        this.loadOffset = 0

        this.isLoadingTable.set(true)
        try {
            const { rows, total } = await this.db.queryRows(
                path,
                target.tableName,
                this.PAGE_SIZE,
                0,
                undefined,
                undefined,
                target.filter ?? undefined,
            )
            const schemaColumns =
                this.schemas()
                    .find((s) => s.alias === target.alias)
                    ?.tables.find((t) => t.name === target.tableName)
                    ?.columns.map((c) => c.name) ?? (rows.length > 0 ? Object.keys(rows[0]) : [])
            this.tableColumns.set(schemaColumns)
            this.tableRows.set(rows)
            this.tableRowTotal.set(total)
            this.loadOffset = rows.length
        } catch (err) {
            this.error.set(describeSqliteError(err, 'Failed to navigate back'))
        } finally {
            this.isLoadingTable.set(false)
        }
    }

    async exportTable(format: ExportFormat): Promise<void> {
        const sel = this.selectedTable()
        if (!sel || this.isExporting()) return

        const path = this.schemas().find((s) => s.alias === sel.schemaAlias)?.path
        if (!path) return

        this.isExporting.set(true)
        try {
            const rows = await this.db.fetchAllRows(
                path,
                sel.tableName,
                this.browseSortCol() ?? undefined,
                this.browseSortDir(),
            )
            const columns = rows.length > 0 ? Object.keys(rows[0]) : this.tableColumns()
            const { tableName } = sel
            let content: string
            let ext: string
            switch (format) {
                case 'csv':
                    content = this.exportSvc.toCsv(columns, rows)
                    ext = 'csv'
                    break
                case 'json':
                    content = this.exportSvc.toJson(rows)
                    ext = 'json'
                    break
                case 'sql':
                    content = this.exportSvc.toSqlInserts(tableName, columns, rows)
                    ext = 'sql'
                    break
                case 'md':
                    content = this.exportSvc.toMarkdown(columns, rows)
                    ext = 'md'
                    break
            }
            await this.exportSvc.saveFile(content, `${tableName}.${ext}`, ext)
        } catch (err) {
            this.error.set(describeSqliteError(err, 'Export failed'))
        } finally {
            this.isExporting.set(false)
        }
    }

    async openSqliteFile(): Promise<void> {
        this.isLoading.set(true)
        this.error.set(null)
        try {
            const path = await this.db.pickFile()
            if (!path) return
            await this.loadFilePath(path)
        } catch (err) {
            this.error.set(describeSqliteError(err, 'Failed to open SQLite file'))
        } finally {
            this.isLoading.set(false)
        }
    }

    async openSampleSqliteDatabase(): Promise<void> {
        const filePath = await save({
            defaultPath: 'quarry-sample.db',
            filters: [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] }],
        })
        if (!filePath) return

        this.isLoading.set(true)
        this.error.set(null)
        try {
            await this.sampleDb.generate(filePath)
            await this.loadFilePath(filePath)
        } catch (err) {
            this.error.set(describeSqliteError(err, 'Failed to create sample SQLite database'))
        } finally {
            this.isLoading.set(false)
        }
    }

    // Called by SessionService during restore — schemas already loaded, skip re-fetching.
    restoreWorkspace(schemas: DatabaseSchema[], name: string): void {
        this.workspace.set({
            id: crypto.randomUUID(),
            name,
            databases: schemas.map((s) => ({ path: s.path, alias: s.alias })),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        })
        this.schemas.set(schemas)
        this.host.setWorkspaceOpen('sqlite')
    }

    async openRecentItem(item: RecentItem): Promise<void> {
        this.isLoading.set(true)
        this.error.set(null)
        try {
            switch (item.providerId) {
                case 'sqlite':
                    await this.loadFilePath(item.resource.path)
                    break
            }
        } catch (error) {
            // File moved or deleted — remove from recent list and show error
            if (item.providerId === 'sqlite') {
                this.recentItemsSvc.remove(item.id)
                this.error.set(
                    describeSqliteError(error, `Could not reopen SQLite file: ${item.resource.path.split('/').pop()}`),
                )
            }
        } finally {
            this.isLoading.set(false)
        }
    }

    private async loadTableImpact(alias: string, tableName: string): Promise<void> {
        const schema = this.schemas().find((s) => s.alias === alias)
        if (!schema) return
        const allTableNames = schema.tables.map((t) => t.name)
        this.isLoadingImpact.set(true)
        try {
            const impact = await this.db.getTableImpact(schema.path, tableName, allTableNames)
            this.tableImpact.set(impact)
        } finally {
            this.isLoadingImpact.set(false)
        }
    }

    private async loadFilePath(path: string): Promise<void> {
        const alias = 'main'
        const schema = await this.db.loadSchema(path, alias)
        const fileName = path.split('/').pop() ?? path
        this.workspace.set({
            id: crypto.randomUUID(),
            name: fileName,
            databases: [{ path, alias }],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        })
        this.schemas.set([schema])
        this.host.setWorkspaceOpen('sqlite')
        this.recentItemsSvc.add(this.recentItemsSvc.createSqliteItem(path))
    }
}
