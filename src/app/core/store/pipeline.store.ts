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
import { type CompiledPipeline, compilePipeline, findVariables } from '@quarrydb/shared/pipeline-sql'

export { buildPipelineSql } from '@quarrydb/shared/pipeline-sql'

import { type ExportFormat, ExportService } from '../services/export.service'
import type { QueryHistoryEntry } from '../services/query-history.service'
import { QueryHistoryService } from '../services/query-history.service'
import type { SavedQuery } from '../services/saved-queries.service'
import type { PipelineBackend, PipelineTable, PipelineTarget } from './pipeline-backend'

export interface StepResultState {
    rows: Record<string, unknown>[]
    columns: string[]
    total: number
    error: string | null
    isLoading: boolean
}

/** The table a pipeline starts from. `path` is the backend key, so saved queries stay scoped to one database. */
export interface PipelineSource {
    path: string
    alias: string
    tableName: string
    columns: string[]
    rowCount: number
}

interface PendingRestore {
    path: string
    tableName: string
    steps: PipelineStep[]
    variableValues: Record<string, string>
}

const EMPTY_RESULT: StepResultState = { rows: [], columns: [], total: 0, error: null, isLoading: false }
const PREVIEW_LIMIT = 50
export const BLOCKED_STEP_MESSAGE = 'Blocked by an error in an earlier step'
const BLOCKED = BLOCKED_STEP_MESSAGE

/** What a step did to the data flowing through it. */
export interface StepFlow {
    rowsIn: number
    rowsOut: number
    added: string[]
    removed: string[]
}

/**
 * How long the full pipeline must stay unchanged before its query is logged to history.
 * Pipelines re-run live on every edit (debounced ~400ms at the input layer) — logging
 * that raw would spam the log with near-duplicate entries per keystroke. Waiting for a
 * longer "settle" pause collapses rapid edits into one entry per query the user actually
 * arrived at.
 */
const HISTORY_SETTLE_MS = 3000

function getStepTexts(step: PipelineStep): string[] {
    switch (step.type) {
        case 'WHERE':
            return [step.expression]
        case 'SELECT':
            return step.columns.map((column) => column.expr)
        case 'ORDER_BY':
            return []
        case 'GROUP_BY':
            return step.aggregations.map((aggregation) => aggregation.expr)
        case 'JOIN':
            return [step.on, ...(step.subSteps ?? []).flatMap(getStepTexts)]
        case 'RAW_SQL':
            return [step.sql]
    }
}

// ─── Store ────────────────────────────────────────────────────────────────────

/** One visual pipeline at a time, over whichever SQL backend opened it. */
@Injectable({ providedIn: 'root' })
export class PipelineStore {
    // ─── Injected Services ────────────────────────────────────────────────────
    private readonly exportSvc = inject(ExportService)
    private readonly queryHistorySvc = inject(QueryHistoryService)

    // ─── State ────────────────────────────────────────────────────────────────
    readonly isExporting = signal(false)
    readonly exportError = signal<string | null>(null)
    readonly backend = signal<PipelineBackend | null>(null)
    readonly source = signal<PipelineSource | null>(null)
    readonly steps = signal<PipelineStep[]>([])
    readonly stepResults = signal<StepResultState[]>([])
    readonly variableValues = signal<Record<string, string>>({})
    private readonly _history = signal<PipelineStep[][]>([[]])
    private readonly _historyIndex = signal(0)
    private historySettleTimer: ReturnType<typeof setTimeout> | null = null
    private pendingRestore: PendingRestore | null = null
    /** Bumped on every run; a run that is no longer the latest stops writing results. */
    private runId = 0
    /** Step the latest run is working on, so a newer run can resume what it abandons. */
    private runningIndex: number | null = null

    // ─── Computed ─────────────────────────────────────────────────────────────
    readonly dialect = computed(() => this.backend()?.dialect ?? 'sqlite')

    readonly compiled = computed<CompiledPipeline | null>(() => {
        const src = this.source()
        const backend = this.backend()
        if (!src || !backend) return null
        return compilePipeline(src.tableName, this.steps(), {
            dialect: backend.dialect,
            variables: this.variableValues(),
            sourceColumns: src.columns,
            schema: backend,
        })
    })

    /** The SQL panel: readable, with variable values inlined. */
    readonly generatedSql = computed(() => {
        const src = this.source()
        const backend = this.backend()
        if (!src || !backend) return ''
        return compilePipeline(src.tableName, this.steps(), {
            dialect: backend.dialect,
            variables: this.variableValues(),
            sourceColumns: src.columns,
            schema: backend,
            keepMissingVariables: true,
        }).display()
    })

    readonly tables = computed<PipelineTable[]>(() => this.backend()?.tables() ?? [])

    readonly detectedVariables = computed<string[]>(() => {
        const found = new Set<string>()
        for (const step of this.steps()) {
            for (const text of getStepTexts(step)) {
                for (const name of findVariables(text)) found.add(name)
            }
        }
        return [...found]
    })
    readonly canUndo = computed(() => this._historyIndex() > 0)
    readonly canRedo = computed(() => this._historyIndex() < this._history().length - 1)

    // ─── Opening ──────────────────────────────────────────────────────────────
    async openForTable(target: PipelineTarget): Promise<void> {
        const { backend, tableName, columns } = target
        const current = this.source()
        this.backend.set(backend)
        if (current?.path === backend.key && current.tableName === tableName) {
            this.applyPendingRestore()
            return
        }

        this.runId++
        this.source.set({ path: backend.key, alias: backend.label, tableName, columns, rowCount: 0 })
        this.steps.set([])
        this.stepResults.set([])
        this.variableValues.set({})
        this._history.set([[]])
        this._historyIndex.set(0)
        this.applyPendingRestore()

        try {
            const compiled = this.compiled()
            const total = compiled ? await backend.count(compiled.count(-1)) : 0
            this.source.update((s) =>
                s?.path === backend.key && s.tableName === tableName ? { ...s, rowCount: total } : s,
            )
        } catch {
            // row count is non-critical — leave at 0
        }
    }

    /** Steps to apply once the matching table opens (session restore). */
    restoreWhenOpened(restore: PendingRestore): void {
        this.pendingRestore = restore
        const src = this.source()
        if (src?.path === restore.path && src.tableName === restore.tableName) this.applyPendingRestore()
    }

    clear(): void {
        this.runId++
        this.backend.set(null)
        this.source.set(null)
        this.steps.set([])
        this.stepResults.set([])
        this.variableValues.set({})
        this._history.set([[]])
        this._historyIndex.set(0)
    }

    /** Columns a step can use: what flows out of the previous step. */
    inputColumns(index: number): string[] {
        const compiled = this.compiled()?.steps[index]
        if (compiled?.inputColumns) return compiled.inputColumns
        const previous = this.stepResults()[index - 1]
        if (previous?.columns.length) return previous.columns
        return this.source()?.columns ?? []
    }

    /**
     * Rows and columns before and after a step, measured against the nearest earlier step that
     * actually ran (pass-through steps are skipped), or the source table.
     */
    flow(index: number): StepFlow | null {
        const results = this.stepResults()
        const compiled = this.compiled()
        const out = results[index]
        if (!out || out.isLoading || out.error || compiled?.steps[index]?.isNoop) return null
        let rowsIn = this.source()?.rowCount ?? 0
        let columnsIn = this.source()?.columns ?? []
        for (let k = index - 1; k >= 0; k--) {
            const previous = results[k]
            if (previous && !previous.error && !compiled?.steps[k]?.isNoop && previous.columns.length) {
                rowsIn = previous.total
                columnsIn = previous.columns
                break
            }
        }
        const before = new Set(columnsIn)
        const after = new Set(out.columns)
        return {
            rowsIn,
            rowsOut: out.total,
            added: out.columns.filter((column) => !before.has(column)),
            removed: columnsIn.filter((column) => !after.has(column)),
        }
    }

    columnsOf(table: string): string[] {
        return this.backend()?.columnsOf(table) ?? []
    }

    // ─── Results ──────────────────────────────────────────────────────────────
    async exportResult(format: ExportFormat): Promise<void> {
        const src = this.source()
        const backend = this.backend()
        const compiled = this.compiled()
        if (!src || !backend || !compiled || this.isExporting()) return

        this.isExporting.set(true)
        this.exportError.set(null)
        try {
            const { rows, columns } = await backend.run(compiled.query(this.steps().length - 1))
            let content: string
            switch (format) {
                case 'csv':
                    content = this.exportSvc.toCsv(columns, rows)
                    break
                case 'json':
                    content = this.exportSvc.toJson(rows)
                    break
                case 'sql':
                    content = this.exportSvc.toSqlInserts(
                        src.tableName.split('.').at(-1) ?? src.tableName,
                        columns,
                        rows,
                        backend.dialect,
                    )
                    break
                case 'md':
                    content = this.exportSvc.toMarkdown(columns, rows)
                    break
            }
            await this.exportSvc.saveFile(content, `${src.tableName.split('.').at(-1)}_query.${format}`, format)
        } catch (error) {
            this.exportError.set(error instanceof Error ? error.message : String(error))
        } finally {
            this.isExporting.set(false)
        }
    }

    // Called during restore — sets steps and re-executes them against the DB.
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

    /** Loads a saved query or history entry; it must belong to the open database. */
    loadSavedQuery(query: SavedQuery | QueryHistoryEntry): boolean {
        const backend = this.backend()
        const columns = backend?.columnsOf(query.source.tableName) ?? query.source.columns
        if (!backend || backend.key !== query.source.path) return false
        void this.openForTable({ backend, tableName: query.source.tableName, columns }).then(() => {
            this.variableValues.set({})
            this.restoreSteps(query.steps)
        })
        return true
    }

    loadHistoryEntry(entry: QueryHistoryEntry): boolean {
        return this.loadSavedQuery(entry)
    }

    // ─── Step editing ─────────────────────────────────────────────────────────
    addStep(): void {
        this.add({ id: crypto.randomUUID(), type: 'WHERE', expression: '' })
    }

    addOrderByStep(): void {
        this.add({ id: crypto.randomUUID(), type: 'ORDER_BY', columns: [], limit: null } satisfies OrderByStep)
    }

    addSelectStep(): void {
        this.add({ id: crypto.randomUUID(), type: 'SELECT', columns: [] } satisfies SelectStep)
    }

    addRawSqlStep(): void {
        this.add({ id: crypto.randomUUID(), type: 'RAW_SQL', sql: '' } satisfies RawSqlStep)
    }

    addJoinStep(): void {
        this.add({
            id: crypto.randomUUID(),
            type: 'JOIN',
            mode: 'inline',
            joinType: 'INNER',
            table: '',
            on: '',
        } satisfies JoinStep)
    }

    addGroupByStep(): void {
        this.add({ id: crypto.randomUUID(), type: 'GROUP_BY', groupBy: [], aggregations: [] } satisfies GroupByStep)
    }

    updateSelectStep(index: number, columns: SelectColumn[]): void {
        this.update(index, { columns })
    }

    updateJoinStep(index: number, joinType: JoinType, table: string, alias: string | undefined, on: string): void {
        this.update(index, { joinType, table, alias, on })
    }

    updateSubpipelineJoin(
        index: number,
        joinType: JoinType,
        subTable: string,
        subSteps: PipelineStep[],
        alias: string | undefined,
        on: string,
    ): void {
        this.update(index, { joinType, subTable, subSteps, alias, on })
    }

    setJoinMode(index: number, mode: JoinMode): void {
        this.update(index, { mode })
    }

    updateGroupByStep(index: number, groupBy: string[], aggregations: Aggregation[]): void {
        this.update(index, { groupBy, aggregations })
    }

    updateRawSqlStep(index: number, sql: string): void {
        this.update(index, { sql })
    }

    updateOrderByStep(index: number, columns: SortColumn[], limit: number | null): void {
        this.update(index, { columns, limit })
    }

    updateStepExpression(index: number, expression: string): void {
        this.update(index, { expression })
    }

    removeStep(index: number): void {
        this.steps.update((prev) => prev.filter((_, i) => i !== index))
        this.stepResults.update((prev) => prev.filter((_, i) => i !== index))
        this.recordHistory()
        if (index < this.steps().length) void this.executeFrom(index)
    }

    reorderSteps(from: number, to: number): void {
        const steps = [...this.steps()]
        const results = [...this.stepResults()]
        const [movedStep] = steps.splice(from, 1)
        const [movedResult] = results.splice(from, 1)
        steps.splice(to, 0, movedStep)
        results.splice(to, 0, movedResult)
        this.steps.set(steps)
        this.stepResults.set(results)
        this.recordHistory()
        void this.executeFrom(Math.min(from, to))
    }

    undo(): void {
        const idx = this._historyIndex()
        if (idx <= 0) return
        this.restoreHistoryAt(idx - 1)
    }

    redo(): void {
        const idx = this._historyIndex()
        if (idx >= this._history().length - 1) return
        this.restoreHistoryAt(idx + 1)
    }

    // ─── Private ──────────────────────────────────────────────────────────────
    private add(step: PipelineStep): void {
        this.steps.update((prev) => [...prev, step])
        this.stepResults.update((prev) => [...prev, { ...EMPTY_RESULT }])
        this.recordHistory()
        void this.executeFrom(this.steps().length - 1)
    }

    private update(index: number, changes: Partial<PipelineStep>): void {
        this.steps.update((prev) => prev.map((s, i) => (i === index ? ({ ...s, ...changes } as PipelineStep) : s)))
        this.recordHistory()
        void this.executeFrom(index)
    }

    private applyPendingRestore(): void {
        const pending = this.pendingRestore
        const src = this.source()
        if (!pending || src?.path !== pending.path || src.tableName !== pending.tableName) return
        this.pendingRestore = null
        this.variableValues.set({ ...pending.variableValues })
        if (pending.steps.length > 0) this.restoreSteps(pending.steps)
    }

    private restoreHistoryAt(index: number): void {
        this._historyIndex.set(index)
        const steps = this._history()[index].map((s) => ({ ...s }))
        this.steps.set(steps)
        this.stepResults.set(steps.map(() => ({ ...EMPTY_RESULT })))
        if (steps.length > 0) void this.executeFrom(0)
    }

    /** Records the current steps as the newest undo state; `_history[_historyIndex]` is always now. */
    private recordHistory(): void {
        const current = this._historyIndex()
        const trimmed = this._history().slice(0, current + 1)
        trimmed.push(this.steps().map((s) => ({ ...s })))
        const capped = trimmed.slice(-50)
        this._history.set(capped)
        this._historyIndex.set(capped.length - 1)
    }

    private async executeFrom(fromIndex: number): Promise<void> {
        const src = this.source()
        const backend = this.backend()
        const compiled = this.compiled()
        if (!src || !backend || !compiled) return

        const runId = ++this.runId
        if (this.runningIndex !== null) fromIndex = Math.min(fromIndex, this.runningIndex)
        const steps = this.steps()
        const upstreamFailed = this.stepResults()
            .slice(0, fromIndex)
            .some((r) => r.error !== null)
        if (upstreamFailed) {
            for (let k = fromIndex; k < steps.length; k++) this.setResult(k, { ...EMPTY_RESULT, error: BLOCKED })
            return
        }

        try {
            await this.runSteps(runId, fromIndex, src, backend, compiled)
        } finally {
            if (runId === this.runId) this.runningIndex = null
        }
    }

    private async runSteps(
        runId: number,
        fromIndex: number,
        src: PipelineSource,
        backend: PipelineBackend,
        compiled: CompiledPipeline,
    ): Promise<void> {
        const steps = this.steps()
        for (let i = fromIndex; i < steps.length; i++) {
            this.runningIndex = i
            const step = compiled.steps[i]
            if (step.error) {
                this.failFrom(i, step.error)
                return
            }
            if (step.isNoop) {
                this.setResult(i, { ...EMPTY_RESULT })
                continue
            }

            this.setResult(i, { ...(this.stepResults()[i] ?? EMPTY_RESULT), isLoading: true, error: null })
            try {
                const startedAt = performance.now()
                const [preview, total] = await Promise.all([
                    backend.run(compiled.query(i, { limit: PREVIEW_LIMIT }), PREVIEW_LIMIT),
                    backend.count(compiled.count(i)),
                ])
                if (runId !== this.runId) return
                this.setResult(i, { ...preview, total, error: null, isLoading: false })

                if (i === steps.length - 1) {
                    this.scheduleHistoryLog({
                        sql: compiled.display(i),
                        steps: steps.map((s) => ({ ...s })),
                        source: { path: src.path, alias: src.alias, tableName: src.tableName, columns: src.columns },
                        durationMs: Math.round(performance.now() - startedAt),
                        rowCount: total,
                    })
                }
            } catch (err) {
                if (runId !== this.runId) return
                this.failFrom(i, err instanceof Error ? err.message : String(err || 'Query failed'))
                return
            }
        }
    }

    private failFrom(index: number, message: string): void {
        this.setResult(index, { ...EMPTY_RESULT, error: message })
        for (let k = index + 1; k < this.steps().length; k++) this.setResult(k, { ...EMPTY_RESULT, error: BLOCKED })
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
