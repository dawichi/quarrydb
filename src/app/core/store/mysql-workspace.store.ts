import { computed, Injectable, inject, signal } from '@angular/core'
import type { MysqlWorkspaceSelection, WorkspaceTab } from '@quarrydb/shared/session'
import type { MysqlConnectionSession, MysqlSchemaSummary, MysqlTableSummary } from '../providers/mysql-backend-adapter'
import { MysqlBackendAdapterService } from '../providers/mysql-backend-adapter.service'
import type { MysqlWorkspaceDraft } from '../providers/mysql-workspace-draft'
import { WorkspaceHostStore } from './workspace-host.store'

@Injectable({ providedIn: 'root' })
export class MysqlWorkspaceStore {
    private readonly PAGE_SIZE = 100

    private readonly host = inject(WorkspaceHostStore)
    private readonly backend = inject(MysqlBackendAdapterService)
    private rowOffset = 0

    readonly connectionSession = signal<MysqlConnectionSession | null>(null)
    readonly schemas = signal<MysqlSchemaSummary[]>([])
    readonly selectedSchemaName = signal<string | null>(null)
    readonly tables = signal<MysqlTableSummary[]>([])
    readonly selectedTable = signal<MysqlWorkspaceSelection | null>(null)
    readonly tableRows = signal<Record<string, unknown>[]>([])
    readonly tableColumns = signal<string[]>([])
    readonly tableRowTotal = signal(0)
    readonly activeTab = signal<WorkspaceTab>('browse')
    readonly querySql = signal('')
    readonly queryRows = signal<Record<string, unknown>[]>([])
    readonly queryColumns = signal<string[]>([])
    readonly queryMeta = signal<string | null>(null)
    readonly sampleDataStatus = signal<string | null>(null)
    readonly isLoadingTables = signal(false)
    readonly isLoadingRows = signal(false)
    readonly isRunningQuery = signal(false)
    readonly isSeedingSampleData = signal(false)

    readonly hasWorkspace = computed(() => this.host.hasWorkspace() && this.host.activeProviderId() === 'mysql')
    readonly hasMoreRows = computed(() => this.tableRows().length < this.tableRowTotal())

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
        this.rowOffset = 0
    }

    setActiveTab(tab: WorkspaceTab): void {
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
            }
        } catch (error) {
            this.host.error.set(error instanceof Error ? error.message : 'Failed to load MySQL tables')
        } finally {
            this.isLoadingTables.set(false)
        }
    }

    async selectTable(schemaName: string, tableName: string): Promise<void> {
        if (this.selectedSchemaName() !== schemaName) {
            await this.selectSchema(schemaName)
        }

        this.selectedTable.set({ schemaName, tableName })
        this.querySql.set(`SELECT * FROM \`${schemaName}\`.\`${tableName}\` LIMIT ${this.PAGE_SIZE}`)
        await this.loadTableRows(true)
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
            this.host.error.set(error instanceof Error ? error.message : 'Failed to run MySQL query')
        } finally {
            this.isRunningQuery.set(false)
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
            this.host.error.set(error instanceof Error ? error.message : 'Failed to load MySQL sample data')
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
            )
            this.tableColumns.set(result.columns)
            this.tableRowTotal.set(result.total)
            this.tableRows.update((rows) => (reset ? result.rows : [...rows, ...result.rows]))
            this.rowOffset = offset + result.rows.length
        } catch (error) {
            this.host.error.set(error instanceof Error ? error.message : 'Failed to load MySQL rows')
        } finally {
            this.isLoadingRows.set(false)
        }
    }

    private defaultQueryForDraft(draft: MysqlWorkspaceDraft | null): string {
        const selected = draft?.selectedTable
        if (!selected) {
            return 'SELECT NOW() AS current_time;'
        }
        return `SELECT * FROM \`${selected.schemaName}\`.\`${selected.tableName}\` LIMIT ${this.PAGE_SIZE}`
    }
}
