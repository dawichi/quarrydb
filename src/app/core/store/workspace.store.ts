import { computed, Injectable, inject, signal } from '@angular/core'
import type { DatabaseSchema, Workspace } from '@quarrydb/shared'
import { DatabaseService } from '../services/database.service'
import { SampleDatabaseService } from '../services/sample-database.service'

interface SelectedTable {
    schemaAlias: string
    tableName: string
}

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
    // ─── Injected Services ────────────────────────────────────────────────────
    private readonly db = inject(DatabaseService)
    private readonly sampleDb = inject(SampleDatabaseService)

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
    readonly browseSortCol = signal<string | null>(null)
    readonly browseSortDir = signal<'ASC' | 'DESC'>('ASC')

    readonly activeTab = signal<'browse' | 'query'>('browse')

    // ─── Computed ─────────────────────────────────────────────────────────────
    readonly hasWorkspace = computed(() => this.workspace() !== null)
    readonly hasMoreRows = computed(() => this.tableRows().length < this.tableRowTotal())

    // ─── Public Methods ───────────────────────────────────────────────────────
    setActiveTab(tab: 'browse' | 'query'): void {
        this.activeTab.set(tab)
    }

    async selectTable(alias: string, tableName: string): Promise<void> {
        this.selectedTable.set({ schemaAlias: alias, tableName })
        this.tableRows.set([])
        this.tableColumns.set([])
        this.tableRowTotal.set(0)
        this.browseSortCol.set(null)
        this.browseSortDir.set('ASC')
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
        this.isLoading.set(true)
        this.error.set(null)
        try {
            const path = await this.sampleDb.generate()
            await this.loadFilePath(path)
        } catch (err) {
            this.error.set(err instanceof Error ? err.message : 'Failed to load sample database')
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
    }
}
