import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core'
import type { AggFn, Aggregation, JoinType, PipelineStep, SelectColumn, SortColumn, StepType } from '@quarrydb/shared'
import { PipelineStore } from '../../../core/store/pipeline.store'
import { WorkspaceStore } from '../../../core/store/workspace.store'

function createEmptyStep(type: StepType): PipelineStep {
    const id = crypto.randomUUID()
    switch (type) {
        case 'WHERE':
            return { id, type: 'WHERE', expression: '' }
        case 'SELECT':
            return { id, type: 'SELECT', columns: [] }
        case 'ORDER_BY':
            return { id, type: 'ORDER_BY', columns: [], limit: null }
        case 'GROUP_BY':
            return { id, type: 'GROUP_BY', groupBy: [], aggregations: [] }
        case 'JOIN':
            return { id, type: 'JOIN', mode: 'inline', joinType: 'INNER', table: '', on: '' }
        case 'RAW_SQL':
            return { id, type: 'RAW_SQL', sql: '' }
    }
}

/**
 * Configuration UI for a JOIN step's subpipeline (mode === 'subpipeline'): picks the
 * source table for the nested pipeline and lets the user stack steps on top of it. Per
 * `docs/post-mvp-scoping.md`, this is v1 — sub-steps cannot themselves be subpipeline-mode
 * JOINs, and there's no live per-step preview inside the nested pipeline (only the outer
 * JOIN step's result is shown).
 */
@Component({
    selector: 'app-subpipeline-editor',
    imports: [],
    templateUrl: './subpipeline-editor.component.html',
})
export class SubpipelineEditorComponent implements OnInit {
    // ─── Inputs / Outputs ─────────────────────────────────────────────────────
    readonly subTable = input.required<string>()
    readonly subSteps = input.required<PipelineStep[]>()

    readonly subTableChange = output<string>()
    readonly subStepsChange = output<PipelineStep[]>()

    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)
    protected readonly pipelineStore = inject(PipelineStore)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly localSubTable = signal('')
    protected readonly localSubSteps = signal<PipelineStep[]>([])
    protected readonly rawSqlHint = '{src}'
    protected readonly JOIN_TYPES: JoinType[] = ['INNER', 'LEFT', 'RIGHT', 'FULL']
    protected readonly AGG_FNS: AggFn[] = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']
    protected readonly STEP_TYPES: { type: StepType; label: string }[] = [
        { type: 'WHERE', label: 'WHERE' },
        { type: 'SELECT', label: 'SELECT' },
        { type: 'ORDER_BY', label: 'ORDER BY' },
        { type: 'GROUP_BY', label: 'GROUP BY' },
        { type: 'JOIN', label: 'JOIN' },
        { type: 'RAW_SQL', label: 'RAW SQL' },
    ]

    protected readonly availableTables = computed(() => {
        const srcAlias = this.pipelineStore.source()?.alias ?? ''
        return this.workspaceStore.schemas().flatMap((schema) =>
            schema.tables.map((table) => ({
                value: schema.alias === srcAlias ? table.name : `${schema.alias}.${table.name}`,
                label: schema.alias === srcAlias ? table.name : `${schema.alias} · ${table.name}`,
            })),
        )
    })

    protected readonly subTableColumns = computed(() => this.columnsFor(this.localSubTable()))

    private debounceTimer: ReturnType<typeof setTimeout> | null = null

    // ─── Lifecycle ────────────────────────────────────────────────────────────
    ngOnInit(): void {
        this.localSubTable.set(this.subTable())
        this.localSubSteps.set(this.subSteps())
    }

    // ─── Source table ─────────────────────────────────────────────────────────
    protected onSubTableChange(event: Event): void {
        const value = (event.target as HTMLSelectElement).value
        this.localSubTable.set(value)
        this.subTableChange.emit(value)
    }

    // ─── Step management ──────────────────────────────────────────────────────
    protected addSubStep(type: StepType): void {
        const updated = [...this.localSubSteps(), createEmptyStep(type)]
        this.localSubSteps.set(updated)
        this.subStepsChange.emit(updated)
    }

    protected removeSubStep(j: number): void {
        const updated = this.localSubSteps().filter((_, i) => i !== j)
        this.localSubSteps.set(updated)
        this.subStepsChange.emit(updated)
    }

    // ─── WHERE ─────────────────────────────────────────────────────────────────
    protected onSubWhereInput(j: number, event: Event): void {
        const value = (event.target as HTMLTextAreaElement).value
        this.updateStep(j, (s) => (s.type === 'WHERE' ? { ...s, expression: value } : s))
        this.debouncedEmit()
    }

    protected insertSubWhereColumn(j: number, textarea: HTMLTextAreaElement, col: string): void {
        const { start, next } = this.insertAtCursor(textarea, col)
        const updated = this.updateStep(j, (s) => (s.type === 'WHERE' ? { ...s, expression: next } : s))
        this.refocus(textarea, start, col.length)
        this.subStepsChange.emit(updated)
    }

    // ─── RAW SQL ──────────────────────────────────────────────────────────────
    protected onSubRawSqlInput(j: number, event: Event): void {
        const value = (event.target as HTMLTextAreaElement).value
        this.updateStep(j, (s) => (s.type === 'RAW_SQL' ? { ...s, sql: value } : s))
        this.debouncedEmit()
    }

    // ─── SELECT ────────────────────────────────────────────────────────────────
    protected isSubSelectColumn(j: number, col: string): boolean {
        const step = this.localSubSteps()[j]
        return step?.type === 'SELECT' && step.columns.some((c) => c.expr === col)
    }

    protected toggleSubSelectColumn(j: number, col: string): void {
        const updated = this.updateStep(j, (s) => {
            if (s.type !== 'SELECT') return s
            const isSelected = s.columns.some((c) => c.expr === col)
            const columns: SelectColumn[] = isSelected
                ? s.columns.filter((c) => c.expr !== col)
                : [...s.columns, { expr: col }]
            return { ...s, columns }
        })
        this.subStepsChange.emit(updated)
    }

    // ─── ORDER BY ─────────────────────────────────────────────────────────────
    protected isSubSortColumn(j: number, col: string): boolean {
        const step = this.localSubSteps()[j]
        return step?.type === 'ORDER_BY' && step.columns.some((c) => c.name === col)
    }

    protected addSubSortColumn(j: number, col: string): void {
        if (this.isSubSortColumn(j, col)) return
        const updated = this.updateStep(j, (s) =>
            s.type === 'ORDER_BY' ? { ...s, columns: [...s.columns, { name: col, direction: 'ASC' as const }] } : s,
        )
        this.subStepsChange.emit(updated)
    }

    protected toggleSubSortDirection(j: number, k: number): void {
        const updated = this.updateStep(j, (s) =>
            s.type === 'ORDER_BY'
                ? {
                      ...s,
                      columns: s.columns.map((c, ci) =>
                          ci === k
                              ? { ...c, direction: (c.direction === 'ASC' ? 'DESC' : 'ASC') as SortColumn['direction'] }
                              : c,
                      ),
                  }
                : s,
        )
        this.subStepsChange.emit(updated)
    }

    protected removeSubSortColumn(j: number, k: number): void {
        const updated = this.updateStep(j, (s) =>
            s.type === 'ORDER_BY' ? { ...s, columns: s.columns.filter((_, ci) => ci !== k) } : s,
        )
        this.subStepsChange.emit(updated)
    }

    protected onSubLimitChange(j: number, event: Event): void {
        const raw = (event.target as HTMLInputElement).value
        const val = raw === '' ? null : Number(raw)
        this.updateStep(j, (s) => (s.type === 'ORDER_BY' ? { ...s, limit: val } : s))
        this.debouncedEmit()
    }

    // ─── GROUP BY ─────────────────────────────────────────────────────────────
    protected isSubGroupByColumn(j: number, col: string): boolean {
        const step = this.localSubSteps()[j]
        return step?.type === 'GROUP_BY' && step.groupBy.includes(col)
    }

    protected toggleSubGroupByColumn(j: number, col: string): void {
        const updated = this.updateStep(j, (s) =>
            s.type === 'GROUP_BY'
                ? { ...s, groupBy: s.groupBy.includes(col) ? s.groupBy.filter((c) => c !== col) : [...s.groupBy, col] }
                : s,
        )
        this.subStepsChange.emit(updated)
    }

    protected addSubAggregation(j: number): void {
        const agg: Aggregation = { fn: 'COUNT', expr: '*', alias: 'count' }
        const updated = this.updateStep(j, (s) =>
            s.type === 'GROUP_BY' ? { ...s, aggregations: [...s.aggregations, agg] } : s,
        )
        this.subStepsChange.emit(updated)
    }

    protected removeSubAggregation(j: number, k: number): void {
        const updated = this.updateStep(j, (s) =>
            s.type === 'GROUP_BY' ? { ...s, aggregations: s.aggregations.filter((_, i) => i !== k) } : s,
        )
        this.subStepsChange.emit(updated)
    }

    protected cycleSubAggFn(j: number, k: number): void {
        const updated = this.updateStep(j, (s) => {
            if (s.type !== 'GROUP_BY') return s
            const current = s.aggregations[k].fn
            const next = this.AGG_FNS[(this.AGG_FNS.indexOf(current) + 1) % this.AGG_FNS.length]
            return { ...s, aggregations: s.aggregations.map((a, i) => (i === k ? { ...a, fn: next } : a)) }
        })
        this.subStepsChange.emit(updated)
    }

    protected onSubAggExprInput(j: number, k: number, event: Event): void {
        const value = (event.target as HTMLInputElement).value
        this.updateStep(j, (s) =>
            s.type === 'GROUP_BY'
                ? { ...s, aggregations: s.aggregations.map((a, i) => (i === k ? { ...a, expr: value } : a)) }
                : s,
        )
        this.debouncedEmit()
    }

    protected onSubAggAliasInput(j: number, k: number, event: Event): void {
        const value = (event.target as HTMLInputElement).value
        this.updateStep(j, (s) =>
            s.type === 'GROUP_BY'
                ? { ...s, aggregations: s.aggregations.map((a, i) => (i === k ? { ...a, alias: value } : a)) }
                : s,
        )
        this.debouncedEmit()
    }

    // ─── JOIN (inline only — no nested subpipelines) ─────────────────────────
    protected cycleSubJoinType(j: number): void {
        const updated = this.updateStep(j, (s) => {
            if (s.type !== 'JOIN') return s
            const next = this.JOIN_TYPES[(this.JOIN_TYPES.indexOf(s.joinType) + 1) % this.JOIN_TYPES.length]
            return { ...s, joinType: next }
        })
        this.subStepsChange.emit(updated)
    }

    protected onSubJoinTableChange(j: number, event: Event): void {
        const value = (event.target as HTMLSelectElement).value
        const updated = this.updateStep(j, (s) => (s.type === 'JOIN' ? { ...s, table: value } : s))
        this.subStepsChange.emit(updated)
    }

    protected onSubJoinAliasInput(j: number, event: Event): void {
        const value = (event.target as HTMLInputElement).value
        this.updateStep(j, (s) => (s.type === 'JOIN' ? { ...s, alias: value || undefined } : s))
        this.debouncedEmit()
    }

    protected onSubJoinOnInput(j: number, event: Event): void {
        const value = (event.target as HTMLTextAreaElement).value
        this.updateStep(j, (s) => (s.type === 'JOIN' ? { ...s, on: value } : s))
        this.debouncedEmit()
    }

    protected subStepJoinTableColumns(j: number): string[] {
        const step = this.localSubSteps()[j]
        return step?.type === 'JOIN' ? this.columnsFor(step.table) : []
    }

    protected insertSubJoinColumn(j: number, textarea: HTMLTextAreaElement, col: string, qualify: boolean): void {
        const step = this.localSubSteps()[j]
        if (step?.type !== 'JOIN') return
        const text = qualify ? `${step.alias || step.table}.${col}` : col
        const { start, next } = this.insertAtCursor(textarea, text)
        const updated = this.updateStep(j, (s) => (s.type === 'JOIN' ? { ...s, on: next } : s))
        this.refocus(textarea, start, text.length)
        this.subStepsChange.emit(updated)
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    private columnsFor(table: string): string[] {
        if (!table) return []
        const srcAlias = this.pipelineStore.source()?.alias ?? ''
        const [schemaAlias, tableName] = table.includes('.') ? table.split('.') : [srcAlias, table]
        const schema = this.workspaceStore.schemas().find((s) => s.alias === schemaAlias)
        return schema?.tables.find((t) => t.name === tableName)?.columns.map((c) => c.name) ?? []
    }

    private updateStep(j: number, updater: (s: PipelineStep) => PipelineStep): PipelineStep[] {
        const updated = this.localSubSteps().map((s, i) => (i === j ? updater(s) : s))
        this.localSubSteps.set(updated)
        return updated
    }

    private insertAtCursor(textarea: HTMLTextAreaElement, text: string): { start: number; next: string } {
        const start = textarea.selectionStart ?? textarea.value.length
        const end = textarea.selectionEnd ?? textarea.value.length
        const next = textarea.value.substring(0, start) + text + textarea.value.substring(end)
        return { start, next }
    }

    private refocus(textarea: HTMLTextAreaElement, start: number, length: number): void {
        setTimeout(() => {
            textarea.setSelectionRange(start + length, start + length)
            textarea.focus()
        }, 0)
    }

    private debouncedEmit(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
            this.subStepsChange.emit(this.localSubSteps())
        }, 400)
    }
}
