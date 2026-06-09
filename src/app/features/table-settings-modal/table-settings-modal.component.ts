import { Component, computed, inject, signal } from '@angular/core'
import { WorkspaceStore } from '../../core/store/workspace.store'

@Component({
    selector: 'app-table-settings-modal',
    templateUrl: './table-settings-modal.component.html',
})
export class TableSettingsModalComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly view = signal<'settings' | 'drop'>('settings')
    protected readonly confirmName = signal('')
    protected readonly isDropping = signal(false)
    protected readonly dropError = signal<string | null>(null)

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

    protected readonly totalImpactRows = computed(() => {
        const imp = this.workspaceStore.tableImpact()
        if (!imp) return 0
        return imp.rowCount + imp.cascadeNodes.reduce((sum, n) => sum + n.rowCount, 0)
    })

    protected readonly canDrop = computed(() => {
        const t = this.workspaceStore.tableSettingsTarget()
        return t !== null && this.confirmName() === t.tableName && !this.isDropping()
    })

    // ─── Actions ──────────────────────────────────────────────────────────────
    protected showDropView(): void {
        this.view.set('drop')
    }

    protected backToSettings(): void {
        this.view.set('settings')
        this.confirmName.set('')
        this.dropError.set(null)
    }

    protected close(): void {
        if (this.isDropping()) return
        this.workspaceStore.closeTableSettings()
        this.reset()
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
    }
}
