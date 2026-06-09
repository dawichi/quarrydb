import { Component, computed, effect, inject, signal } from '@angular/core'
import type { ViewSchema } from '@quarrydb/shared'
import { WorkspaceStore } from '../../core/store/workspace.store'

function extractSelectBody(fullSql: string): string {
    const match = fullSql.match(/^CREATE\s+(?:TEMP(?:ORARY)?\s+)?VIEW\s+(?:"[^"]*"|`[^`]*`|\[[^\]]*\]|\S+)\s+AS\s+/i)
    return match ? fullSql.slice(match[0].length) : fullSql
}

@Component({
    selector: 'app-view-modal',
    templateUrl: './view-modal.component.html',
})
export class ViewModalComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly mode = signal<'create' | 'edit' | 'drop'>('create')
    protected readonly viewName = signal('')
    protected readonly selectSql = signal('')
    protected readonly confirmName = signal('')
    protected readonly isExecuting = signal(false)
    protected readonly error = signal<string | null>(null)

    constructor() {
        effect(() => {
            const target = this.workspaceStore.viewModalTarget()
            if (!target) return
            if (target.view) {
                this.mode.set('edit')
                this.viewName.set(target.view.name)
                this.selectSql.set(extractSelectBody(target.view.sql))
            } else {
                this.mode.set('create')
                this.viewName.set('')
                this.selectSql.set('')
            }
            this.confirmName.set('')
            this.error.set(null)
            this.isExecuting.set(false)
        })
    }

    // ─── Computed ─────────────────────────────────────────────────────────────
    protected readonly originalView = computed<ViewSchema | null>(
        () => this.workspaceStore.viewModalTarget()?.view ?? null,
    )

    protected readonly generatedSql = computed(() => {
        const name = this.viewName().trim()
        const body = this.selectSql().trim()
        if (!name || !body) return ''
        const createStmt = `CREATE VIEW "${name}" AS\n${body}`
        if (this.mode() === 'edit') {
            const orig = this.originalView()
            if (!orig) return createStmt
            if (orig.name === name) return `DROP VIEW "${orig.name}";\n${createStmt}`
            return `DROP VIEW "${orig.name}";\n${createStmt}`
        }
        return createStmt
    })

    protected readonly canExecute = computed(() => {
        if (this.isExecuting()) return false
        if (this.mode() === 'drop') {
            const orig = this.originalView()
            return orig !== null && this.confirmName() === orig.name
        }
        return this.viewName().trim().length > 0 && this.selectSql().trim().length > 0
    })

    // ─── Actions ──────────────────────────────────────────────────────────────
    protected showDrop(): void {
        this.mode.set('drop')
        this.confirmName.set('')
        this.error.set(null)
    }

    protected showEdit(): void {
        this.mode.set('edit')
        this.error.set(null)
    }

    protected close(): void {
        if (this.isExecuting()) return
        this.workspaceStore.closeViewModal()
    }

    protected async execute(): Promise<void> {
        const target = this.workspaceStore.viewModalTarget()
        if (!target || !this.canExecute()) return

        this.isExecuting.set(true)
        this.error.set(null)
        try {
            if (this.mode() === 'drop') {
                const orig = this.originalView()
                if (!orig) return
                await this.workspaceStore.dropView(target.alias, orig.name)
            } else if (this.mode() === 'edit') {
                const orig = this.originalView()
                if (!orig) return
                await this.workspaceStore.editView(
                    target.alias,
                    orig.name,
                    this.viewName().trim(),
                    this.selectSql().trim(),
                )
            } else {
                await this.workspaceStore.createView(target.alias, this.viewName().trim(), this.selectSql().trim())
            }
            this.workspaceStore.closeViewModal()
        } catch (err) {
            this.error.set(err instanceof Error ? err.message : 'Operation failed')
        } finally {
            this.isExecuting.set(false)
        }
    }
}
