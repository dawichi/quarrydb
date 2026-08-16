import { computed, Injectable, inject, signal } from '@angular/core'
import { SqliteDatabaseService } from '../services/sqlite-database.service'
import { describeSqliteError } from '../services/sqlite-error'

export interface UpdateEdit {
    kind: 'update'
    pkValues: Record<string, unknown>
    changes: Record<string, unknown>
    original: Record<string, unknown>
}

export interface DeleteEdit {
    kind: 'delete'
    pkValues: Record<string, unknown>
    original: Record<string, unknown>
}

export interface InsertEdit {
    kind: 'insert'
    values: Record<string, unknown>
}

export type EditOperation = UpdateEdit | DeleteEdit | InsertEdit

@Injectable({ providedIn: 'root' })
export class EditStore {
    private readonly db = inject(SqliteDatabaseService)

    readonly pendingEdits = signal<EditOperation[]>([])
    readonly applyError = signal<string | null>(null)
    readonly isApplying = signal(false)

    readonly hasPending = computed(() => this.pendingEdits().length > 0)
    readonly updateCount = computed(() => this.pendingEdits().filter((e) => e.kind === 'update').length)
    readonly deleteCount = computed(() => this.pendingEdits().filter((e) => e.kind === 'delete').length)
    readonly insertCount = computed(() => this.pendingEdits().filter((e) => e.kind === 'insert').length)

    stageUpdate(
        pkValues: Record<string, unknown>,
        col: string,
        newValue: unknown,
        original: Record<string, unknown>,
    ): void {
        const pkKey = JSON.stringify(pkValues)
        this.pendingEdits.update((ops) => {
            const existingIdx = ops.findIndex((op) => op.kind === 'update' && JSON.stringify(op.pkValues) === pkKey)
            if (existingIdx >= 0) {
                const existing = ops[existingIdx] as UpdateEdit
                const updated: UpdateEdit = { ...existing, changes: { ...existing.changes, [col]: newValue } }
                return [...ops.slice(0, existingIdx), updated, ...ops.slice(existingIdx + 1)]
            }
            if (ops.some((op) => op.kind === 'delete' && JSON.stringify(op.pkValues) === pkKey)) return ops
            return [...ops, { kind: 'update', pkValues, changes: { [col]: newValue }, original }]
        })
    }

    stageDelete(pkValues: Record<string, unknown>, original: Record<string, unknown>): void {
        const pkKey = JSON.stringify(pkValues)
        this.pendingEdits.update((ops) => {
            const filtered = ops.filter((op) => !(op.kind === 'update' && JSON.stringify(op.pkValues) === pkKey))
            return [...filtered, { kind: 'delete', pkValues, original }]
        })
    }

    unstageDelete(pkValues: Record<string, unknown>): void {
        const pkKey = JSON.stringify(pkValues)
        this.pendingEdits.update((ops) =>
            ops.filter((op) => !(op.kind === 'delete' && JSON.stringify(op.pkValues) === pkKey)),
        )
    }

    stageInsert(values: Record<string, unknown>): void {
        this.pendingEdits.update((ops) => [...ops, { kind: 'insert', values }])
    }

    unstage(index: number): void {
        this.pendingEdits.update((ops) => ops.filter((_, i) => i !== index))
    }

    clearAll(): void {
        this.pendingEdits.set([])
        this.applyError.set(null)
    }

    isRowDeleted(pkValues: Record<string, unknown>): boolean {
        const pkKey = JSON.stringify(pkValues)
        return this.pendingEdits().some((op) => op.kind === 'delete' && JSON.stringify(op.pkValues) === pkKey)
    }

    getRowUpdate(pkValues: Record<string, unknown>): UpdateEdit | null {
        const pkKey = JSON.stringify(pkValues)
        const op = this.pendingEdits().find((op) => op.kind === 'update' && JSON.stringify(op.pkValues) === pkKey)
        return op?.kind === 'update' ? op : null
    }

    async applyAll(path: string, tableName: string): Promise<boolean> {
        return this.applyAllWith((ops) => this.db.applyEdits(path, tableName, ops))
    }

    async applyAllWith(apply: (ops: EditOperation[]) => Promise<void>): Promise<boolean> {
        this.isApplying.set(true)
        this.applyError.set(null)
        try {
            await apply(this.pendingEdits())
            this.clearAll()
            return true
        } catch (err) {
            this.applyError.set(describeSqliteError(err, 'Apply failed'))
            return false
        } finally {
            this.isApplying.set(false)
        }
    }
}
