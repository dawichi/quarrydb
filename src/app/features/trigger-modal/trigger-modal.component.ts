import { Component, computed, effect, inject, signal } from '@angular/core'
import type { TriggerSchema } from '@quarrydb/shared'
import { describeSqliteError } from '../../core/services/sqlite-error'
import { SqliteWorkspaceStore } from '../../core/store/sqlite-workspace.store'

@Component({
    selector: 'app-trigger-modal',
    templateUrl: './trigger-modal.component.html',
})
export class TriggerModalComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(SqliteWorkspaceStore)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly mode = signal<'create' | 'edit' | 'drop'>('create')
    protected readonly triggerSql = signal('')
    protected readonly confirmName = signal('')
    protected readonly isExecuting = signal(false)
    protected readonly error = signal<string | null>(null)

    protected readonly PLACEHOLDER = `CREATE TRIGGER log_insert
AFTER INSERT ON orders
FOR EACH ROW
BEGIN
  INSERT INTO audit_log (action, table_name, row_id, created_at)
  VALUES ('INSERT', 'orders', NEW.id, CURRENT_TIMESTAMP);
END`

    constructor() {
        effect(() => {
            const target = this.workspaceStore.triggerModalTarget()
            if (!target) return
            if (target.trigger) {
                this.mode.set('edit')
                this.triggerSql.set(target.trigger.sql)
            } else {
                this.mode.set('create')
                this.triggerSql.set('')
            }
            this.confirmName.set('')
            this.error.set(null)
            this.isExecuting.set(false)
        })
    }

    // ─── Computed ─────────────────────────────────────────────────────────────
    protected readonly originalTrigger = computed<TriggerSchema | null>(
        () => this.workspaceStore.triggerModalTarget()?.trigger ?? null,
    )

    protected readonly generatedSql = computed(() => {
        const sql = this.triggerSql().trim()
        if (!sql) return ''
        if (this.mode() === 'edit') {
            const orig = this.originalTrigger()
            if (!orig) return sql
            return `DROP TRIGGER "${orig.name}";\n${sql}`
        }
        return sql
    })

    protected readonly canExecute = computed(() => {
        if (this.isExecuting()) return false
        if (this.mode() === 'drop') {
            const orig = this.originalTrigger()
            return orig !== null && this.confirmName() === orig.name
        }
        return this.triggerSql().trim().length > 0
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
        this.workspaceStore.closeTriggerModal()
    }

    protected async execute(): Promise<void> {
        const target = this.workspaceStore.triggerModalTarget()
        if (!target || !this.canExecute()) return

        this.isExecuting.set(true)
        this.error.set(null)
        try {
            if (this.mode() === 'drop') {
                const orig = this.originalTrigger()
                if (!orig) return
                await this.workspaceStore.dropTrigger(target.alias, orig.name)
            } else if (this.mode() === 'edit') {
                const orig = this.originalTrigger()
                if (!orig) return
                await this.workspaceStore.editTrigger(target.alias, orig.name, this.triggerSql().trim())
            } else {
                await this.workspaceStore.createTrigger(target.alias, this.triggerSql().trim())
            }
            this.workspaceStore.closeTriggerModal()
        } catch (err) {
            this.error.set(describeSqliteError(err, 'Trigger operation failed'))
        } finally {
            this.isExecuting.set(false)
        }
    }
}
