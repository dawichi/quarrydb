import { Component, computed, inject, signal } from '@angular/core'
import { WorkspaceStore } from '../../core/store/workspace.store'
import { buildCreateIndexSql } from './index.utils'

@Component({
    selector: 'app-table-settings-modal',
    templateUrl: './table-settings-modal.component.html',
})
export class TableSettingsModalComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly view = signal<'settings' | 'drop' | 'create-index' | 'drop-index'>('settings')

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
    }

    protected close(): void {
        if (this.isDropping() || this.isIndexing()) return
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
    }
}
