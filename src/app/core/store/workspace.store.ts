import { computed, Injectable, inject, signal } from '@angular/core'
import type { DatabaseSchema, ForeignKey, Workspace } from '@quarrydb/shared'
import { save } from '@tauri-apps/plugin-dialog'
import { DatabaseService } from '../services/database.service'
import { type ExportFormat, ExportService } from '../services/export.service'
import { RecentFilesService } from '../services/recent-files.service'
import { SampleDatabaseService } from '../services/sample-database.service'

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
export class WorkspaceStore {
    // ─── Injected Services ────────────────────────────────────────────────────
    private readonly db = inject(DatabaseService)
    private readonly sampleDb = inject(SampleDatabaseService)
    private readonly exportSvc = inject(ExportService)
    private readonly recentFilesSvc = inject(RecentFilesService)

    // ─── Private ──────────────────────────────────────────────────────────────
    private readonly PAGE_SIZE = 100
    private loadOffset = 0

    // ─── State ────────────────────────────────────────────────────────────────
    readonly workspace = signal<Workspace | null>(null)
    readonly schemas = signal<DatabaseSchema[]>([])
    readonly isLoading = signal(false)
    readonly error = signal<string | null>(null)

    readonly selectedTable = signal<SelectedTable | null>(null)
    readonly tableRows = signal<Record<string, unknown>[]>([])
    readonly tableColumns = signal<string[]>([])
    readonly tableRowTotal = signal<number>(0)
    readonly isLoadingTable = signal(false)
    readonly isExporting = signal(false)
    readonly browseSortCol = signal<string | null>(null)
    readonly browseSortDir = signal<'ASC' | 'DESC'>('ASC')

    readonly activeTab = signal<'browse' | 'query' | 'edit'>('browse')
    readonly browseFilter = signal<BrowseFilter | null>(null)
    readonly browseNavStack = signal<BrowseNavEntry[]>([])

    // ─── Computed ─────────────────────────────────────────────────────────────
    readonly hasWorkspace = computed(() => this.workspace() !== null)
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
            this.error.set(err instanceof Error ? err.message : 'Failed to load table')
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
            this.error.set(err instanceof Error ? err.message : 'Failed to load more rows')
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
            this.error.set(err instanceof Error ? err.message : 'Failed to sort table')
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
            this.error.set(err instanceof Error ? err.message : 'Failed to navigate to reference')
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
            this.error.set(err instanceof Error ? err.message : 'Failed to navigate back')
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
            this.error.set(err instanceof Error ? err.message : 'Export failed')
        } finally {
            this.isExporting.set(false)
        }
    }

    async openDatabase(): Promise<void> {
        this.isLoading.set(true)
        this.error.set(null)
        try {
            const path = await this.db.pickFile()
            if (!path) return
            await this.loadFilePath(path)
        } catch (err) {
            this.error.set(err instanceof Error ? err.message : 'Failed to open database')
        } finally {
            this.isLoading.set(false)
        }
    }

    async openSampleDatabase(): Promise<void> {
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
            this.error.set(err instanceof Error ? err.message : 'Failed to create sample database')
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
    }

    async openRecentFile(path: string): Promise<void> {
        this.isLoading.set(true)
        this.error.set(null)
        try {
            await this.loadFilePath(path)
        } catch {
            // File moved or deleted — remove from recent list and show error
            this.recentFilesSvc.remove(path)
            this.error.set(`File not found: ${path.split('/').pop()}`)
        } finally {
            this.isLoading.set(false)
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
        this.recentFilesSvc.add(path)
    }
}
