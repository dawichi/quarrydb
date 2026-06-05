import { computed, Injectable, inject, signal } from '@angular/core'
import type { OrderByStep, PipelineStep, RawSqlStep, SortColumn } from '@quarrydb/shared'
import { DatabaseService } from '../services/database.service'

export interface StepResultState {
    rows: Record<string, unknown>[]
    columns: string[]
    total: number
    error: string | null
    isLoading: boolean
}

interface PipelineSource {
    path: string
    alias: string
    tableName: string
    columns: string[]
    rowCount: number
}

const EMPTY_RESULT: StepResultState = { rows: [], columns: [], total: 0, error: null, isLoading: false }
const PREVIEW_LIMIT = 50

// ─── SQL Generation ───────────────────────────────────────────────────────────

function buildStepCte(prev: string, step: PipelineStep): string {
    switch (step.type) {
        case 'WHERE':
            return `SELECT * FROM ${prev} WHERE ${step.expression}`
        case 'ORDER_BY': {
            let sql = `SELECT * FROM ${prev}`
            if (step.columns.length > 0) {
                sql += ` ORDER BY ${step.columns.map((c) => `"${c.name}" ${c.direction}`).join(', ')}`
            }
            if (step.limit !== null) sql += ` LIMIT ${step.limit}`
            return sql
        }
        case 'RAW_SQL': {
            const sql = step.sql.trim()
            return sql ? sql.replaceAll('{src}', prev) : `SELECT * FROM ${prev}`
        }
        default:
            return `SELECT * FROM ${prev}`
    }
}

export function buildPipelineSql(tableName: string, steps: PipelineStep[]): string {
    if (steps.length === 0) return `SELECT * FROM "${tableName}"`

    const ctes = [`step_1 AS (SELECT * FROM "${tableName}")`]
    for (let i = 0; i < steps.length; i++) {
        const prev = `step_${i + 1}`
        const curr = `step_${i + 2}`
        ctes.push(`${curr} AS (${buildStepCte(prev, steps[i])})`)
    }
    return `WITH ${ctes.join(',\n     ')}\nSELECT * FROM step_${steps.length + 1}`
}

// ─── Store ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PipelineStore {
    // ─── Injected Services ────────────────────────────────────────────────────
    private readonly db = inject(DatabaseService)

    // ─── State ────────────────────────────────────────────────────────────────
    readonly source = signal<PipelineSource | null>(null)
    readonly steps = signal<PipelineStep[]>([])
    readonly stepResults = signal<StepResultState[]>([])

    // ─── Computed ─────────────────────────────────────────────────────────────
    readonly generatedSql = computed(() => {
        const src = this.source()
        return src ? buildPipelineSql(src.tableName, this.steps()) : ''
    })

    // ─── Public Methods ───────────────────────────────────────────────────────
    async openForTable(path: string, alias: string, tableName: string, columns: string[]): Promise<void> {
        const current = this.source()
        if (current?.path === path && current?.tableName === tableName) return

        this.source.set({ path, alias, tableName, columns, rowCount: 0 })
        this.steps.set([])
        this.stepResults.set([])

        try {
            const { total } = await this.db.executeQuery(path, `SELECT * FROM "${tableName}"`, 0)
            this.source.update((s) => (s ? { ...s, rowCount: total } : s))
        } catch {
            // row count is non-critical — leave at 0
        }
    }

    addStep(): void {
        const step: PipelineStep = { id: crypto.randomUUID(), type: 'WHERE', expression: '' }
        this.steps.update((prev) => [...prev, step])
        this.stepResults.update((prev) => [...prev, { ...EMPTY_RESULT }])
    }

    addOrderByStep(): void {
        const step: OrderByStep = { id: crypto.randomUUID(), type: 'ORDER_BY', columns: [], limit: null }
        this.steps.update((prev) => [...prev, step])
        this.stepResults.update((prev) => [...prev, { ...EMPTY_RESULT }])
    }

    addRawSqlStep(): void {
        const step: RawSqlStep = { id: crypto.randomUUID(), type: 'RAW_SQL', sql: '' }
        this.steps.update((prev) => [...prev, step])
        this.stepResults.update((prev) => [...prev, { ...EMPTY_RESULT }])
    }

    updateRawSqlStep(index: number, sql: string): void {
        this.steps.update((prev) => prev.map((s, i) => (i === index ? ({ ...s, sql } as PipelineStep) : s)))
        void this.executeFrom(index)
    }

    updateOrderByStep(index: number, columns: SortColumn[], limit: number | null): void {
        this.steps.update((prev) => prev.map((s, i) => (i === index ? ({ ...s, columns, limit } as PipelineStep) : s)))
        void this.executeFrom(index)
    }

    removeStep(index: number): void {
        this.steps.update((prev) => prev.filter((_, i) => i !== index))
        this.stepResults.update((prev) => prev.filter((_, i) => i !== index))
        if (index < this.steps().length) {
            void this.executeFrom(index)
        }
    }

    updateStepExpression(index: number, expression: string): void {
        this.steps.update((prev) => prev.map((s, i) => (i === index ? ({ ...s, expression } as PipelineStep) : s)))
        void this.executeFrom(index)
    }

    // ─── Private ──────────────────────────────────────────────────────────────
    private async executeFrom(fromIndex: number): Promise<void> {
        const src = this.source()
        if (!src) return

        const steps = this.steps()

        for (let i = fromIndex; i < steps.length; i++) {
            const step = steps[i]

            if (step.type === 'WHERE' && !step.expression.trim()) {
                this.setResult(i, { ...EMPTY_RESULT })
                continue
            }
            if (step.type === 'ORDER_BY' && step.columns.length === 0 && step.limit === null) {
                this.setResult(i, { ...EMPTY_RESULT })
                continue
            }
            if (step.type === 'RAW_SQL' && !step.sql.trim()) {
                this.setResult(i, { ...EMPTY_RESULT })
                continue
            }

            this.setResult(i, { ...(this.stepResults()[i] ?? EMPTY_RESULT), isLoading: true, error: null })

            try {
                const sql = buildPipelineSql(src.tableName, steps.slice(0, i + 1))
                const result = await this.db.executeQuery(src.path, sql, PREVIEW_LIMIT)
                this.setResult(i, { ...result, error: null, isLoading: false })
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Query failed'
                this.setResult(i, { ...EMPTY_RESULT, error: msg })
                for (let k = i + 1; k < steps.length; k++) {
                    this.setResult(k, { ...EMPTY_RESULT, error: 'Blocked by upstream error' })
                }
                break
            }
        }
    }

    private setResult(index: number, result: StepResultState): void {
        this.stepResults.update((prev) => prev.map((r, i) => (i === index ? result : r)))
    }
}
