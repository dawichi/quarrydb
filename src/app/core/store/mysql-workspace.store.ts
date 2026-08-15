import { computed, Injectable, inject, signal } from '@angular/core'
import type { MysqlWorkspaceSelection, MysqlWorkspaceTab } from '@quarrydb/shared/session'
import type {
    MysqlConnectionSession,
    MysqlSchemaSummary,
    MysqlTableBrowseOptions,
    MysqlTableSummary,
} from '../providers/mysql-backend-adapter'
import { MysqlBackendAdapterService } from '../providers/mysql-backend-adapter.service'
import type { MysqlWorkspaceDraft } from '../providers/mysql-workspace-draft'
import { type ExportFormat, ExportService } from '../services/export.service'
import { EditStore } from './edit.store'
import { WorkspaceHostStore } from './workspace-host.store'

@Injectable({ providedIn: 'root' })
export class MysqlWorkspaceStore {
    private readonly PAGE_SIZE = 100

    private readonly host = inject(WorkspaceHostStore)
    private readonly backend = inject(MysqlBackendAdapterService)
    private readonly exportService = inject(ExportService)
    readonly editStore = inject(EditStore)
    private rowOffset = 0

    readonly connectionSession = signal<MysqlConnectionSession | null>(null)
    readonly schemas = signal<MysqlSchemaSummary[]>([])
    readonly selectedSchemaName = signal<string | null>(null)
    readonly tables = signal<MysqlTableSummary[]>([])
    readonly selectedTable = signal<MysqlWorkspaceSelection | null>(null)
    readonly tableRows = signal<Record<string, unknown>[]>([])
    readonly tableColumns = signal<string[]>([])
    readonly tableRowTotal = signal(0)
    readonly browseFilter = signal('')
    readonly browseSortColumn = signal<string | null>(null)
    readonly browseSortDirection = signal<'asc' | 'desc'>('asc')
    readonly activeTab = signal<MysqlWorkspaceTab>('browse')
    readonly querySql = signal('')
    readonly queryRows = signal<Record<string, unknown>[]>([])
    readonly queryColumns = signal<string[]>([])
    readonly queryMeta = signal<string | null>(null)
    readonly sampleDataStatus = signal<string | null>(null)
    readonly isLoadingTables = signal(false)
    readonly isLoadingRows = signal(false)
    readonly isRunningQuery = signal(false)
    readonly isSeedingSampleData = signal(false)
    readonly isExporting = signal(false)

    readonly hasWorkspace = computed(() => this.host.hasWorkspace() && this.host.activeProviderId() === 'mysql')
    readonly hasMoreRows = computed(() => this.tableRows().length < this.tableRowTotal())
    readonly selectedTableSummary = computed(() => {
        const selected = this.selectedTable()
        return selected ? (this.tables().find((table) => table.name === selected.tableName) ?? null) : null
    })

    async openWorkspace(
        session: MysqlConnectionSession,
        schemas: MysqlSchemaSummary[],
        draft: MysqlWorkspaceDraft | null,
    ): Promise<void> {
        this.connectionSession.set(session)
        this.schemas.set(schemas)
        this.activeTab.set(draft?.activeTab ?? 'browse')
        this.querySql.set(this.defaultQueryForDraft(draft))
        this.queryRows.set([])
        this.queryColumns.set([])
        this.queryMeta.set(null)
        this.sampleDataStatus.set(null)
        this.editStore.clearAll()

        const initialSchema =
            draft?.selectedTable?.schemaName ??
            session.target.defaultDatabase ??
            schemas.find((schema) => schema.isDefault)?.name ??
            schemas[0]?.name ??
            null

        if (initialSchema) {
            await this.selectSchema(initialSchema)
        } else {
            this.selectedSchemaName.set(null)
            this.tables.set([])
        }

        if (draft?.selectedTable) {
            await this.selectTable(draft.selectedTable.schemaName, draft.selectedTable.tableName)
        } else {
            this.selectedTable.set(null)
            this.tableRows.set([])
            this.tableColumns.set([])
            this.tableRowTotal.set(0)
        }

        this.host.setWorkspaceOpen('mysql')
    }

    clear(): void {
        this.connectionSession.set(null)
        this.schemas.set([])
        this.selectedSchemaName.set(null)
        this.tables.set([])
        this.selectedTable.set(null)
        this.tableRows.set([])
        this.tableColumns.set([])
        this.tableRowTotal.set(0)
        this.browseFilter.set('')
        this.browseSortColumn.set(null)
        this.browseSortDirection.set('asc')
        this.activeTab.set('browse')
        this.querySql.set('')
        this.queryRows.set([])
        this.queryColumns.set([])
        this.queryMeta.set(null)
        this.sampleDataStatus.set(null)
        this.isLoadingTables.set(false)
        this.isLoadingRows.set(false)
        this.isRunningQuery.set(false)
        this.isSeedingSampleData.set(false)
        this.isExporting.set(false)
        this.editStore.clearAll()
        this.rowOffset = 0
    }

    setActiveTab(tab: MysqlWorkspaceTab): void {
        this.activeTab.set(tab)
    }

    async selectSchema(schemaName: string): Promise<void> {
        const session = this.connectionSession()
        if (!session) {
            return
        }

        this.isLoadingTables.set(true)
        this.host.error.set(null)
        try {
            const tables = await this.backend.listTables(session, schemaName)
            this.selectedSchemaName.set(schemaName)
            this.tables.set(tables)

            const selected = this.selectedTable()
            if (selected?.schemaName !== schemaName) {
                this.selectedTable.set(null)
                this.tableRows.set([])
                this.tableColumns.set([])
                this.tableRowTotal.set(0)
                this.browseFilter.set('')
                this.browseSortColumn.set(null)
                this.browseSortDirection.set('asc')
            }
        } catch (error) {
            this.host.error.set(this.describeError(error, 'Failed to load MySQL tables'))
        } finally {
            this.isLoadingTables.set(false)
        }
    }

    async selectTable(schemaName: string, tableName: string): Promise<void> {
        if (this.selectedTable()?.schemaName !== schemaName || this.selectedTable()?.tableName !== tableName) {
            this.editStore.clearAll()
        }
        if (this.selectedSchemaName() !== schemaName) {
            await this.selectSchema(schemaName)
        }

        this.selectedTable.set({ schemaName, tableName })
        this.browseFilter.set('')
        this.browseSortColumn.set(null)
        this.browseSortDirection.set('asc')
        this.querySql.set(`SELECT * FROM \`${schemaName}\`.\`${tableName}\` LIMIT ${this.PAGE_SIZE}`)
        await this.loadTableRows(true)
    }

    applyBrowseOptions(options: MysqlTableBrowseOptions): void {
        this.browseFilter.set(options.filter?.trim() ?? '')
        this.browseSortColumn.set(options.sortColumn ?? null)
        this.browseSortDirection.set(options.sortDirection ?? 'asc')
        void this.loadTableRows(true)
    }

    async applyPendingEdits(): Promise<boolean> {
        const session = this.connectionSession()
        const selected = this.selectedTable()
        if (!session || !selected || !this.editStore.hasPending()) return false

        const success = await this.editStore.applyAllWith((operations) =>
            this.backend.applyEdits(session, selected.schemaName, selected.tableName, operations),
        )
        if (success) {
            await this.loadTableRows(true)
        }
        return success
    }

    async loadMoreRows(): Promise<void> {
        if (this.isLoadingRows() || !this.selectedTable()) {
            return
        }
        await this.loadTableRows(false)
    }

    async runQuery(): Promise<void> {
        const session = this.connectionSession()
        const sql = this.querySql().trim()
        if (!session || !sql) {
            return
        }

        this.isRunningQuery.set(true)
        this.host.error.set(null)
        this.queryRows.set([])
        this.queryColumns.set([])
        this.queryMeta.set(null)
        try {
            const result = await this.backend.runQuery(session, sql, this.PAGE_SIZE)
            this.queryRows.set(result.rows)
            this.queryColumns.set(result.columns)
            this.queryMeta.set(
                result.kind === 'rows'
                    ? `${result.rows.length} row${result.rows.length === 1 ? '' : 's'} returned`
                    : `Statement executed. ${result.affectedRows ?? 0} row${result.affectedRows === 1 ? '' : 's'} affected`,
            )
        } catch (error) {
            this.host.error.set(this.describeError(error, 'Failed to run MySQL query'))
        } finally {
            this.isRunningQuery.set(false)
        }
    }

    async exportTable(format: ExportFormat): Promise<void> {
        const session = this.connectionSession()
        const selected = this.selectedTable()
        if (!session || !selected || this.isExporting()) return

        this.isExporting.set(true)
        this.host.error.set(null)
        try {
            const result = await this.backend.fetchTableRows(session, selected.schemaName, selected.tableName)
            await this.exportService.saveFile(
                this.exportContent(format, selected.tableName, result.columns, result.rows),
                `${selected.tableName}.${format === 'md' ? 'md' : format}`,
                format,
            )
        } catch (error) {
            this.host.error.set(this.describeError(error, 'Failed to export MySQL table'))
        } finally {
            this.isExporting.set(false)
        }
    }

    async exportQuery(format: ExportFormat): Promise<void> {
        const session = this.connectionSession()
        const sql = this.querySql().trim()
        if (!session || !sql || this.isExporting()) return

        this.isExporting.set(true)
        this.host.error.set(null)
        try {
            const rows = await this.backend.runQueryFull(session, sql)
            const columns = rows.length > 0 ? Object.keys(rows[0]) : this.queryColumns()
            await this.exportService.saveFile(
                this.exportContent(format, 'mysql_query', columns, rows),
                `mysql_query.${format === 'md' ? 'md' : format}`,
                format,
            )
        } catch (error) {
            this.host.error.set(this.describeError(error, 'Failed to export MySQL query'))
        } finally {
            this.isExporting.set(false)
        }
    }

    async loadSampleData(): Promise<void> {
        const session = this.connectionSession()
        const schemaName = this.selectedSchemaName()
        if (!session || !schemaName) {
            return
        }

        this.isSeedingSampleData.set(true)
        this.host.error.set(null)
        this.sampleDataStatus.set(null)
        try {
            const inserted = await this.backend.seedSampleData(session, schemaName)
            await this.selectSchema(schemaName)
            this.sampleDataStatus.set(
                inserted
                    ? `Loaded sample data into ${schemaName}.`
                    : `Sample tables already contained data in ${schemaName}; nothing was inserted.`,
            )

            const selected = this.selectedTable()
            if (selected) {
                await this.selectTable(selected.schemaName, selected.tableName)
                return
            }

            const defaultTable = this.tables().find((table) => table.name === 'orders') ?? this.tables()[0]
            if (defaultTable) {
                await this.selectTable(schemaName, defaultTable.name)
            }
        } catch (error) {
            this.host.error.set(this.describeError(error, 'Failed to load MySQL sample data'))
        } finally {
            this.isSeedingSampleData.set(false)
        }
    }

    private async loadTableRows(reset: boolean): Promise<void> {
        const session = this.connectionSession()
        const selected = this.selectedTable()
        if (!session || !selected) {
            return
        }

        const offset = reset ? 0 : this.rowOffset
        this.isLoadingRows.set(true)
        this.host.error.set(null)
        try {
            const result = await this.backend.queryTableRows(
                session,
                selected.schemaName,
                selected.tableName,
                this.PAGE_SIZE,
                offset,
                {
                    filter: this.browseFilter(),
                    sortColumn: this.browseSortColumn() ?? undefined,
                    sortDirection: this.browseSortDirection(),
                },
            )
            this.tableColumns.set(result.columns)
            this.tableRowTotal.set(result.total)
            this.tableRows.update((rows) => (reset ? result.rows : [...rows, ...result.rows]))
            this.rowOffset = offset + result.rows.length
        } catch (error) {
            this.host.error.set(this.describeError(error, 'Failed to load MySQL rows'))
        } finally {
            this.isLoadingRows.set(false)
        }
    }

    private defaultQueryForDraft(draft: MysqlWorkspaceDraft | null): string {
        const selected = draft?.selectedTable
        if (!selected) {
            return 'SELECT NOW() AS now_value;'
        }
        return `SELECT * FROM \`${selected.schemaName}\`.\`${selected.tableName}\` LIMIT ${this.PAGE_SIZE}`
    }

    private exportContent(
        format: ExportFormat,
        tableName: string,
        columns: string[],
        rows: Record<string, unknown>[],
    ): string {
        switch (format) {
            case 'csv':
                return this.exportService.toCsv(columns, rows)
            case 'json':
                return this.exportService.toJson(rows)
            case 'sql':
                return this.exportService.toSqlInserts(tableName, columns, rows, 'mysql')
            case 'md':
                return this.exportService.toMarkdown(columns, rows)
        }
    }

    private describeError(error: unknown, fallback: string): string {
        if (error instanceof Error && error.message.trim()) {
            return error.message
        }

        if (typeof error === 'string' && error.trim()) {
            return error
        }

        return fallback
    }
}
