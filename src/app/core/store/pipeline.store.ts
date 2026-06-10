import { computed, Injectable, inject, signal } from '@angular/core'
import type {
    Aggregation,
    GroupByStep,
    JoinMode,
    JoinStep,
    JoinType,
    OrderByStep,
    PipelineStep,
    RawSqlStep,
    SelectColumn,
    SelectStep,
    SortColumn,
} from '@quarrydb/shared'
import { type ExportFormat, ExportService } from '../services/export.service'
import type { QueryHistoryEntry } from '../services/query-history.service'
import { QueryHistoryService } from '../services/query-history.service'
import type { SavedQuery } from '../services/saved-queries.service'
import { SqliteDatabaseService } from '../services/sqlite-database.service'

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

/**
 * How long the full pipeline must stay unchanged before its query is logged to history.
 * Pipelines re-run live on every edit (debounced ~500ms at the input layer) — logging
 * that raw would spam the log with near-duplicate entries per keystroke. Waiting for a
 * longer "settle" pause collapses rapid edits into one entry per query the user actually
 * arrived at.
 */
const HISTORY_SETTLE_MS = 3000

// ─── Variable Helpers ─────────────────────────────────────────────────────────

function substituteVars(text: string, vars: Record<string, string>): string {
    return text.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name: string) => vars[name] ?? `:${name}`)
}

function getStepTexts(step: PipelineStep): string[] {
    switch (step.type) {
        case 'WHERE':
            return [step.expression]
        case 'SELECT':
            return step.columns.flatMap((c) => [c.expr, c.alias ?? ''])
        case 'ORDER_BY':
            return []
        case 'GROUP_BY':
            return step.aggregations.flatMap((a) => [a.expr, a.alias])
        case 'JOIN':
            return [step.on, step.table, ...(step.subSteps ?? []).flatMap(getStepTexts)]
        case 'RAW_SQL':
            return [step.sql]
        default:
            return []
    }
}

// ─── SQL Generation ───────────────────────────────────────────────────────────

function buildStepCte(prev: string, step: PipelineStep, vars: Record<string, string>): string {
    const v = (text: string) => substituteVars(text, vars)
    switch (step.type) {
        case 'SELECT': {
            if (step.columns.length === 0) return `SELECT * FROM ${prev}`
            const cols = step.columns
                .filter((c) => c.expr.trim())
                .map((c) => (c.alias ? `${v(c.expr)} AS "${c.alias}"` : v(c.expr)))
                .join(', ')
            return cols ? `SELECT ${cols} FROM ${prev}` : `SELECT * FROM ${prev}`
        }
        case 'WHERE':
            return `SELECT * FROM ${prev} WHERE ${v(step.expression)}`
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
                    selectParts.push(`${agg.fn}(${v(agg.expr)}) AS "${alias}"`)
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
            return `SELECT * FROM ${prev} ${step.joinType} JOIN ${tableRef}${alias} ON ${v(step.on)}`
        }
        case 'RAW_SQL': {
            const sql = v(step.sql.trim())
            return sql ? sql.replaceAll('{src}', prev) : `SELECT * FROM ${prev}`
        }
        default:
            return `SELECT * FROM ${prev}`
    }
}

/**
 * Appends the CTE chain for a JOIN step's nested subpipeline (prefixed `${curr}_sub_N`
 * to stay unique alongside the outer `step_N` chain), then the JOIN step's own CTE
 * referencing the final subpipeline CTE as its right-hand side.
 */
function pushSubpipelineJoinCtes(
    ctes: string[],
    step: JoinStep,
    prev: string,
    curr: string,
    vars: Record<string, string>,
): void {
    const subTable = step.subTable ?? ''
    const subSteps = step.subSteps ?? []
    if (!subTable || !step.on.trim()) {
        ctes.push(`${curr} AS (SELECT * FROM ${prev})`)
        return
    }

    const prefix = `${curr}_sub`
    ctes.push(`${prefix}_1 AS (SELECT * FROM "${subTable}")`)
    for (let j = 0; j < subSteps.length; j++) {
        ctes.push(`${prefix}_${j + 2} AS (${buildStepCte(`${prefix}_${j + 1}`, subSteps[j], vars)})`)
    }
    const finalSub = `${prefix}_${subSteps.length + 1}`
    const alias = step.alias ? ` AS "${step.alias}"` : ''
    ctes.push(
        `${curr} AS (SELECT * FROM ${prev} ${step.joinType} JOIN ${finalSub}${alias} ON ${substituteVars(step.on, vars)})`,
    )
}

export function buildPipelineSql(tableName: string, steps: PipelineStep[], vars: Record<string, string> = {}): string {
    if (steps.length === 0) return `SELECT * FROM "${tableName}"`

    const ctes = [`step_1 AS (SELECT * FROM "${tableName}")`]
    for (let i = 0; i < steps.length; i++) {
        const prev = `step_${i + 1}`
        const curr = `step_${i + 2}`
        const step = steps[i]
        if (step.type === 'JOIN' && step.mode === 'subpipeline') {
            pushSubpipelineJoinCtes(ctes, step, prev, curr, vars)
        } else {
            ctes.push(`${curr} AS (${buildStepCte(prev, step, vars)})`)
        }
    }
    return `WITH ${ctes.join(',\n     ')}\nSELECT * FROM step_${steps.length + 1}`
}

// ─── Store ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PipelineStore {
    // ─── Injected Services ────────────────────────────────────────────────────
    private readonly db = inject(SqliteDatabaseService)
    private readonly exportSvc = inject(ExportService)
    private readonly queryHistorySvc = inject(QueryHistoryService)

    // ─── State ────────────────────────────────────────────────────────────────
    readonly isExporting = signal(false)
    readonly source = signal<PipelineSource | null>(null)
    readonly steps = signal<PipelineStep[]>([])
    readonly stepResults = signal<StepResultState[]>([])
    readonly variableValues = signal<Record<string, string>>({})
    private readonly _history = signal<PipelineStep[][]>([[]])
    private readonly _historyIndex = signal(0)
    private historySettleTimer: ReturnType<typeof setTimeout> | null = null

    // ─── Computed ─────────────────────────────────────────────────────────────
    readonly generatedSql = computed(() => {
        const src = this.source()
        return src ? buildPipelineSql(src.tableName, this.steps(), this.variableValues()) : ''
    })

    readonly detectedVariables = computed<string[]>(() => {
        const found = new Set<string>()
        const re = /:([a-zA-Z_][a-zA-Z0-9_]*)/g
        for (const step of this.steps()) {
            for (const text of getStepTexts(step)) {
                for (const match of text.matchAll(re)) found.add(match[1])
            }
        }
        return [...found]
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
        this.variableValues.set({})
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

    // Called by SessionService during restore — sets steps and re-executes them against the DB.
    restoreSteps(steps: PipelineStep[]): void {
        this.steps.set(steps.map((s) => ({ ...s })))
        this.stepResults.set(steps.map(() => ({ ...EMPTY_RESULT })))
        this._history.set([steps.map((s) => ({ ...s }))])
        this._historyIndex.set(0)
        void this.executeFrom(0)
    }

    setVariableValue(name: string, value: string): void {
        this.variableValues.update((v) => ({ ...v, [name]: value }))
    }

    reExecute(): void {
        if (this.steps().length > 0) void this.executeFrom(0)
    }

    async loadSavedQuery(query: SavedQuery): Promise<void> {
        const src = query.source
        await this.openForTable(src.path, src.alias, src.tableName, src.columns)
        this.variableValues.set({})
        this.restoreSteps(query.steps)
    }

    async loadHistoryEntry(entry: QueryHistoryEntry): Promise<void> {
        const src = entry.source
        await this.openForTable(src.path, src.alias, src.tableName, src.columns)
        this.variableValues.set({})
        this.restoreSteps(entry.steps)
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

    updateSubpipelineJoin(
        index: number,
        joinType: JoinType,
        subTable: string,
        subSteps: PipelineStep[],
        alias: string | undefined,
        on: string,
    ): void {
        this.pushToHistory()
        this.steps.update((prev) =>
            prev.map((s, i) => (i === index ? ({ ...s, joinType, subTable, subSteps, alias, on } as PipelineStep) : s)),
        )
        void this.executeFrom(index)
    }

    setJoinMode(index: number, mode: JoinMode): void {
        this.pushToHistory()
        this.steps.update((prev) => prev.map((s, i) => (i === index ? ({ ...s, mode } as PipelineStep) : s)))
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
            if (step.type === 'JOIN') {
                const source = step.mode === 'subpipeline' ? step.subTable : step.table
                if (!source || !step.on.trim()) {
                    this.setResult(i, { ...EMPTY_RESULT })
                    continue
                }
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
                const sql = buildPipelineSql(src.tableName, steps.slice(0, i + 1), this.variableValues())
                const startedAt = performance.now()
                const result = await this.db.executeQuery(src.path, sql, PREVIEW_LIMIT)
                this.setResult(i, { ...result, error: null, isLoading: false })

                if (i === steps.length - 1) {
                    this.scheduleHistoryLog({
                        sql,
                        steps: steps.map((s) => ({ ...s })),
                        source: { path: src.path, alias: src.alias, tableName: src.tableName, columns: src.columns },
                        durationMs: Math.round(performance.now() - startedAt),
                        rowCount: result.total,
                    })
                }
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

    /**
     * Debounces query-history logging behind `HISTORY_SETTLE_MS` of inactivity — every
     * successful full-pipeline run reschedules the timer, so only the query the user
     * actually settles on gets logged, not each intermediate keystroke's version of it.
     */
    private scheduleHistoryLog(entry: Parameters<QueryHistoryService['log']>[0]): void {
        if (this.historySettleTimer) clearTimeout(this.historySettleTimer)
        this.historySettleTimer = setTimeout(() => {
            this.historySettleTimer = null
            this.queryHistorySvc.log(entry)
        }, HISTORY_SETTLE_MS)
    }

    private setResult(index: number, result: StepResultState): void {
        this.stepResults.update((prev) => prev.map((r, i) => (i === index ? result : r)))
    }
}
