import { computed, Injectable, inject, signal } from '@angular/core'
import type {
    Aggregation,
    GroupByStep,
    JoinStep,
    JoinType,
    OrderByStep,
    PipelineStep,
    RawSqlStep,
    SelectColumn,
    SelectStep,
    SortColumn,
} from '@quarrydb/shared'
import { DatabaseService } from '../services/database.service'
import { type ExportFormat, ExportService } from '../services/export.service'

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
        case 'SELECT': {
            if (step.columns.length === 0) return `SELECT * FROM ${prev}`
            const cols = step.columns
                .filter((c) => c.expr.trim())
                .map((c) => (c.alias ? `${c.expr} AS "${c.alias}"` : c.expr))
                .join(', ')
            return cols ? `SELECT ${cols} FROM ${prev}` : `SELECT * FROM ${prev}`
        }
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
        case 'GROUP_BY': {
            if (step.groupBy.length === 0) return `SELECT * FROM ${prev}`
            const groupCols = step.groupBy.map((c) => `"${c}"`).join(', ')
            const selectParts: string[] = step.groupBy.map((c) => `"${c}"`)
            for (const agg of step.aggregations) {
                if (agg.expr.trim()) {
                    const alias = agg.alias.trim() || agg.fn.toLowerCase()
                    selectParts.push(`${agg.fn}(${agg.expr}) AS "${alias}"`)
                }
            }
            return `SELECT ${selectParts.join(', ')} FROM ${prev} GROUP BY ${groupCols}`
        }
        case 'JOIN': {
            if (!step.table || !step.on.trim()) return `SELECT * FROM ${prev}`
            const tableRef = step.table.includes('.')
                ? step.table
                      .split('.')
                      .map((p) => `"${p}"`)
                      .join('.')
                : `"${step.table}"`
            const alias = step.alias ? ` AS "${step.alias}"` : ''
            return `SELECT * FROM ${prev} ${step.joinType} JOIN ${tableRef}${alias} ON ${step.on}`
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
    private readonly exportSvc = inject(ExportService)

    // ─── State ────────────────────────────────────────────────────────────────
    readonly isExporting = signal(false)
    readonly source = signal<PipelineSource | null>(null)
    readonly steps = signal<PipelineStep[]>([])
    readonly stepResults = signal<StepResultState[]>([])
    private readonly _history = signal<PipelineStep[][]>([[]])
    private readonly _historyIndex = signal(0)

    // ─── Computed ─────────────────────────────────────────────────────────────
    readonly generatedSql = computed(() => {
        const src = this.source()
        return src ? buildPipelineSql(src.tableName, this.steps()) : ''
    })
    readonly canUndo = computed(() => this._historyIndex() > 0)
    readonly canRedo = computed(() => this._historyIndex() < this._history().length - 1)

    // ─── Public Methods ───────────────────────────────────────────────────────
    async openForTable(path: string, alias: string, tableName: string, columns: string[]): Promise<void> {
        const current = this.source()
        if (current?.path === path && current?.tableName === tableName) return

        this.source.set({ path, alias, tableName, columns, rowCount: 0 })
        this.steps.set([])
        this.stepResults.set([])
        this._history.set([[]])
        this._historyIndex.set(0)

        try {
            const { total } = await this.db.executeQuery(path, `SELECT * FROM "${tableName}"`, 0)
            this.source.update((s) => (s ? { ...s, rowCount: total } : s))
        } catch {
            // row count is non-critical — leave at 0
        }
    }

    async exportResult(format: ExportFormat): Promise<void> {
        const src = this.source()
        if (!src || this.isExporting()) return

        this.isExporting.set(true)
        try {
            const sql = this.generatedSql()
            const rows = await this.db.executeQueryFull(src.path, sql)
            const columns = rows.length > 0 ? Object.keys(rows[0]) : src.columns
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
                    content = this.exportSvc.toSqlInserts(src.tableName, columns, rows)
                    ext = 'sql'
                    break
                case 'md':
                    content = this.exportSvc.toMarkdown(columns, rows)
                    ext = 'md'
                    break
            }
            await this.exportSvc.saveFile(content, `${src.tableName}_query.${ext}`, ext)
        } finally {
            this.isExporting.set(false)
        }
    }

    addStep(): void {
        this.pushToHistory()
        const step: PipelineStep = { id: crypto.randomUUID(), type: 'WHERE', expression: '' }
        this.steps.update((prev) => [...prev, step])
        this.stepResults.update((prev) => [...prev, { ...EMPTY_RESULT }])
        void this.executeFrom(this.steps().length - 1)
    }

    addOrderByStep(): void {
        this.pushToHistory()
        const step: OrderByStep = { id: crypto.randomUUID(), type: 'ORDER_BY', columns: [], limit: null }
        this.steps.update((prev) => [...prev, step])
        this.stepResults.update((prev) => [...prev, { ...EMPTY_RESULT }])
        void this.executeFrom(this.steps().length - 1)
    }

    addSelectStep(): void {
        this.pushToHistory()
        const step: SelectStep = { id: crypto.randomUUID(), type: 'SELECT', columns: [] }
        this.steps.update((prev) => [...prev, step])
        this.stepResults.update((prev) => [...prev, { ...EMPTY_RESULT }])
        void this.executeFrom(this.steps().length - 1)
    }

    updateSelectStep(index: number, columns: SelectColumn[]): void {
        this.pushToHistory()
        this.steps.update((prev) => prev.map((s, i) => (i === index ? ({ ...s, columns } as PipelineStep) : s)))
        void this.executeFrom(index)
    }

    addRawSqlStep(): void {
        this.pushToHistory()
        const step: RawSqlStep = { id: crypto.randomUUID(), type: 'RAW_SQL', sql: '' }
        this.steps.update((prev) => [...prev, step])
        this.stepResults.update((prev) => [...prev, { ...EMPTY_RESULT }])
        void this.executeFrom(this.steps().length - 1)
    }

    addJoinStep(): void {
        this.pushToHistory()
        const step: JoinStep = {
            id: crypto.randomUUID(),
            type: 'JOIN',
            mode: 'inline',
            joinType: 'INNER',
            table: '',
            on: '',
        }
        this.steps.update((prev) => [...prev, step])
        this.stepResults.update((prev) => [...prev, { ...EMPTY_RESULT }])
        void this.executeFrom(this.steps().length - 1)
    }

    updateJoinStep(index: number, joinType: JoinType, table: string, alias: string | undefined, on: string): void {
        this.pushToHistory()
        this.steps.update((prev) =>
            prev.map((s, i) => (i === index ? ({ ...s, joinType, table, alias, on } as PipelineStep) : s)),
        )
        void this.executeFrom(index)
    }

    addGroupByStep(): void {
        this.pushToHistory()
        const step: GroupByStep = { id: crypto.randomUUID(), type: 'GROUP_BY', groupBy: [], aggregations: [] }
        this.steps.update((prev) => [...prev, step])
        this.stepResults.update((prev) => [...prev, { ...EMPTY_RESULT }])
        void this.executeFrom(this.steps().length - 1)
    }

    updateGroupByStep(index: number, groupBy: string[], aggregations: Aggregation[]): void {
        this.pushToHistory()
        this.steps.update((prev) =>
            prev.map((s, i) => (i === index ? ({ ...s, groupBy, aggregations } as PipelineStep) : s)),
        )
        void this.executeFrom(index)
    }

    updateRawSqlStep(index: number, sql: string): void {
        this.pushToHistory()
        this.steps.update((prev) => prev.map((s, i) => (i === index ? ({ ...s, sql } as PipelineStep) : s)))
        void this.executeFrom(index)
    }

    updateOrderByStep(index: number, columns: SortColumn[], limit: number | null): void {
        this.pushToHistory()
        this.steps.update((prev) => prev.map((s, i) => (i === index ? ({ ...s, columns, limit } as PipelineStep) : s)))
        void this.executeFrom(index)
    }

    removeStep(index: number): void {
        this.pushToHistory()
        this.steps.update((prev) => prev.filter((_, i) => i !== index))
        this.stepResults.update((prev) => prev.filter((_, i) => i !== index))
        if (index < this.steps().length) {
            void this.executeFrom(index)
        }
    }

    updateStepExpression(index: number, expression: string): void {
        this.pushToHistory()
        this.steps.update((prev) => prev.map((s, i) => (i === index ? ({ ...s, expression } as PipelineStep) : s)))
        void this.executeFrom(index)
    }

    reorderSteps(from: number, to: number): void {
        this.pushToHistory()
        const steps = [...this.steps()]
        const results = [...this.stepResults()]
        const [movedStep] = steps.splice(from, 1)
        const [movedResult] = results.splice(from, 1)
        steps.splice(to, 0, movedStep)
        results.splice(to, 0, movedResult)
        this.steps.set(steps)
        this.stepResults.set(results)
        void this.executeFrom(Math.min(from, to))
    }

    undo(): void {
        const idx = this._historyIndex()
        if (idx <= 0) return
        const newIdx = idx - 1
        this._historyIndex.set(newIdx)
        const steps = this._history()[newIdx].map((s) => ({ ...s }))
        this.steps.set(steps)
        this.stepResults.set(steps.map(() => ({ ...EMPTY_RESULT })))
        if (steps.length > 0) void this.executeFrom(0)
    }

    redo(): void {
        const idx = this._historyIndex()
        if (idx >= this._history().length - 1) return
        const newIdx = idx + 1
        this._historyIndex.set(newIdx)
        const steps = this._history()[newIdx].map((s) => ({ ...s }))
        this.steps.set(steps)
        this.stepResults.set(steps.map(() => ({ ...EMPTY_RESULT })))
        if (steps.length > 0) void this.executeFrom(0)
    }

    // ─── Private ──────────────────────────────────────────────────────────────
    private pushToHistory(): void {
        const current = this._historyIndex()
        const trimmed = this._history().slice(0, current + 1)
        trimmed.push(this.steps().map((s) => ({ ...s })))
        const capped = trimmed.slice(-50)
        this._history.set(capped)
        this._historyIndex.set(capped.length - 1)
    }

    private async executeFrom(fromIndex: number): Promise<void> {
        const src = this.source()
        if (!src) return

        const steps = this.steps()

        // If any upstream step already failed, everything from here is blocked — don't execute.
        const upstreamFailed = this.stepResults()
            .slice(0, fromIndex)
            .some((r) => r.error !== null)
        if (upstreamFailed) {
            for (let k = fromIndex; k < steps.length; k++) {
                this.setResult(k, { ...EMPTY_RESULT, error: 'Blocked by upstream error' })
            }
            return
        }

        for (let i = fromIndex; i < steps.length; i++) {
            const step = steps[i]

            if (step.type === 'SELECT' && step.columns.length === 0) {
                this.setResult(i, { ...EMPTY_RESULT })
                continue
            }
            if (step.type === 'WHERE' && !step.expression.trim()) {
                this.setResult(i, { ...EMPTY_RESULT })
                continue
            }
            if (step.type === 'ORDER_BY' && step.columns.length === 0 && step.limit === null) {
                this.setResult(i, { ...EMPTY_RESULT })
                continue
            }
            if (step.type === 'JOIN' && (!step.table || !step.on.trim())) {
                this.setResult(i, { ...EMPTY_RESULT })
                continue
            }
            if (step.type === 'GROUP_BY' && step.groupBy.length === 0) {
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
