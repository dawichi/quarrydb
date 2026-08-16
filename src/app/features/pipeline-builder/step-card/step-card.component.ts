import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core'
import type { AggFn, Aggregation, JoinMode, JoinType, PipelineStep, SelectColumn, SortColumn } from '@quarrydb/shared'
import { PipelineStore, type StepResultState } from '../../../core/store/pipeline.store'
import { SqliteWorkspaceStore } from '../../../core/store/sqlite-workspace.store'
import { SubpipelineEditorComponent } from './subpipeline-editor.component'

@Component({
    selector: 'app-step-card',
    imports: [SubpipelineEditorComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './step-card.component.html',
})
export class StepCardComponent implements OnInit {
    // ─── Inputs ───────────────────────────────────────────────────────────────
    readonly step = input.required<PipelineStep>()
    readonly stepIndex = input.required<number>()
    readonly result = input.required<StepResultState | undefined>()

    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly pipelineStore = inject(PipelineStore)
    protected readonly workspaceStore = inject(SqliteWorkspaceStore)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly expression = signal('')
    protected readonly sortColumns = signal<SortColumn[]>([])
    protected readonly limit = signal<number | null>(null)
    protected readonly rawSql = signal('')
    protected readonly rawSqlPlaceholder = 'SELECT * FROM {src} WHERE ...'
    protected readonly rawSqlHint = '{src}'
    protected readonly selectColumns = signal<SelectColumn[]>([])
    protected readonly draggedIndex = signal<number | null>(null)
    protected readonly dropTargetIndex = signal<number | null>(null)
    protected readonly groupByColumns = signal<string[]>([])
    protected readonly aggregations = signal<Aggregation[]>([])
    protected readonly AGG_FNS: AggFn[] = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']
    protected readonly joinMode = signal<JoinMode>('inline')
    protected readonly joinType = signal<JoinType>('INNER')
    protected readonly joinTable = signal('')
    protected readonly joinAlias = signal('')
    protected readonly joinOn = signal('')
    protected readonly joinSubTable = signal('')
    protected readonly joinSubSteps = signal<PipelineStep[]>([])
    protected readonly JOIN_TYPES: JoinType[] = ['INNER', 'LEFT', 'RIGHT', 'FULL']
    protected readonly availableTables = computed(() => {
        const srcAlias = this.pipelineStore.source()?.alias ?? ''
        return this.workspaceStore.schemas().flatMap((schema) =>
            schema.tables.map((table) => ({
                value: schema.alias === srcAlias ? table.name : `${schema.alias}.${table.name}`,
                label: schema.alias === srcAlias ? table.name : `${schema.alias} · ${table.name}`,
            })),
        )
    })
    protected readonly joinTableColumns = computed(() => {
        const table = this.joinTable()
        if (!table) return []
        const srcAlias = this.pipelineStore.source()?.alias ?? ''
        const [schemaAlias, tableName] = table.includes('.') ? table.split('.') : [srcAlias, table]
        const schema = this.workspaceStore.schemas().find((s) => s.alias === schemaAlias)
        return schema?.tables.find((t) => t.name === tableName)?.columns.map((c) => c.name) ?? []
    })

    private debounceTimer: ReturnType<typeof setTimeout> | null = null
    private limitDebounceTimer: ReturnType<typeof setTimeout> | null = null

    // ─── Lifecycle ────────────────────────────────────────────────────────────
    ngOnInit(): void {
        const s = this.step()
        if (s.type === 'WHERE') this.expression.set(s.expression)
        if (s.type === 'ORDER_BY') {
            this.sortColumns.set(s.columns)
            this.limit.set(s.limit)
        }
        if (s.type === 'RAW_SQL') this.rawSql.set(s.sql)
        if (s.type === 'SELECT') this.selectColumns.set(s.columns)
        if (s.type === 'GROUP_BY') {
            this.groupByColumns.set(s.groupBy)
            this.aggregations.set(s.aggregations)
        }
        if (s.type === 'JOIN') {
            this.joinMode.set(s.mode)
            this.joinType.set(s.joinType)
            this.joinTable.set(s.table)
            this.joinAlias.set(s.alias ?? '')
            this.joinOn.set(s.on)
            this.joinSubTable.set(s.subTable ?? '')
            this.joinSubSteps.set(s.subSteps ?? [])
        }
    }

    // ─── WHERE methods ────────────────────────────────────────────────────────
    protected onInput(event: Event): void {
        const value = (event.target as HTMLTextAreaElement).value
        this.expression.set(value)
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
            this.pipelineStore.updateStepExpression(this.stepIndex(), value)
        }, 400)
    }

    protected insertColumn(textarea: HTMLTextAreaElement, col: string): void {
        const start = textarea.selectionStart ?? textarea.value.length
        const end = textarea.selectionEnd ?? textarea.value.length
        const current = textarea.value
        const next = current.substring(0, start) + col + current.substring(end)
        this.expression.set(next)
        setTimeout(() => {
            textarea.setSelectionRange(start + col.length, start + col.length)
            textarea.focus()
        }, 0)
        this.pipelineStore.updateStepExpression(this.stepIndex(), next)
    }

    // ─── RAW SQL methods ──────────────────────────────────────────────────────
    protected onRawSqlInput(event: Event): void {
        const value = (event.target as HTMLTextAreaElement).value
        this.rawSql.set(value)
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
            this.pipelineStore.updateRawSqlStep(this.stepIndex(), value)
        }, 400)
    }

    // ─── SELECT methods ───────────────────────────────────────────────────────
    protected isSelectedColumn(name: string): boolean {
        return this.selectColumns().some((c) => c.expr === name)
    }

    protected addSelectColumn(name: string): void {
        if (this.isSelectedColumn(name)) return
        const updated = [...this.selectColumns(), { expr: name }]
        this.selectColumns.set(updated)
        this.pipelineStore.updateSelectStep(this.stepIndex(), updated)
    }

    protected removeSelectColumn(i: number): void {
        const updated = this.selectColumns().filter((_, idx) => idx !== i)
        this.selectColumns.set(updated)
        this.pipelineStore.updateSelectStep(this.stepIndex(), updated)
    }

    protected toggleSelectColumn(name: string): void {
        const i = this.selectColumns().findIndex((c) => c.expr === name)
        if (i >= 0) this.removeSelectColumn(i)
        else this.addSelectColumn(name)
    }

    protected addCustomExpr(): void {
        const updated = [...this.selectColumns(), { expr: '' }]
        this.selectColumns.set(updated)
        this.pipelineStore.updateSelectStep(this.stepIndex(), updated)
    }

    protected onSelectExprInput(event: Event, i: number): void {
        const value = (event.target as HTMLInputElement).value
        const updated = this.selectColumns().map((c, idx) => (idx === i ? { ...c, expr: value } : c))
        this.selectColumns.set(updated)
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
            this.pipelineStore.updateSelectStep(this.stepIndex(), updated)
        }, 400)
    }

    protected onSelectAliasInput(event: Event, i: number): void {
        const value = (event.target as HTMLInputElement).value
        const updated = this.selectColumns().map((c, idx) => (idx === i ? { ...c, alias: value || undefined } : c))
        this.selectColumns.set(updated)
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
            this.pipelineStore.updateSelectStep(this.stepIndex(), updated)
        }, 400)
    }

    protected onGripMouseDown(event: MouseEvent, i: number): void {
        event.preventDefault()
        this.draggedIndex.set(i)
        this.dropTargetIndex.set(i)
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
        const cleanup = () => {
            const from = this.draggedIndex()
            const to = this.dropTargetIndex()
            this.draggedIndex.set(null)
            this.dropTargetIndex.set(null)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            if (from !== null && to !== null && from !== to) {
                const cols = [...this.selectColumns()]
                const [moved] = cols.splice(from, 1)
                cols.splice(to, 0, moved)
                this.selectColumns.set(cols)
                this.pipelineStore.updateSelectStep(this.stepIndex(), cols)
            }
            document.removeEventListener('mouseup', cleanup)
        }
        document.addEventListener('mouseup', cleanup)
    }

    protected onRowMouseEnter(i: number): void {
        if (this.draggedIndex() !== null) {
            this.dropTargetIndex.set(i)
        }
    }

    // ─── GROUP BY methods ─────────────────────────────────────────────────────
    protected isGroupByColumn(col: string): boolean {
        return this.groupByColumns().includes(col)
    }

    protected toggleGroupByColumn(col: string): void {
        const current = this.groupByColumns()
        const updated = current.includes(col) ? current.filter((c) => c !== col) : [...current, col]
        this.groupByColumns.set(updated)
        this.pipelineStore.updateGroupByStep(this.stepIndex(), updated, this.aggregations())
    }

    protected addAggregation(): void {
        const updated = [...this.aggregations(), { fn: 'COUNT' as AggFn, expr: '*', alias: 'count' }]
        this.aggregations.set(updated)
        this.pipelineStore.updateGroupByStep(this.stepIndex(), this.groupByColumns(), updated)
    }

    protected removeAggregation(i: number): void {
        const updated = this.aggregations().filter((_, idx) => idx !== i)
        this.aggregations.set(updated)
        this.pipelineStore.updateGroupByStep(this.stepIndex(), this.groupByColumns(), updated)
    }

    protected cycleAggFn(i: number): void {
        const current = this.aggregations()[i].fn
        const next = this.AGG_FNS[(this.AGG_FNS.indexOf(current) + 1) % this.AGG_FNS.length]
        const updated = this.aggregations().map((a, idx) => (idx === i ? { ...a, fn: next } : a))
        this.aggregations.set(updated)
        this.pipelineStore.updateGroupByStep(this.stepIndex(), this.groupByColumns(), updated)
    }

    protected onAggExprInput(event: Event, i: number): void {
        const value = (event.target as HTMLInputElement).value
        const updated = this.aggregations().map((a, idx) => (idx === i ? { ...a, expr: value } : a))
        this.aggregations.set(updated)
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
            this.pipelineStore.updateGroupByStep(this.stepIndex(), this.groupByColumns(), updated)
        }, 400)
    }

    protected onAggAliasInput(event: Event, i: number): void {
        const value = (event.target as HTMLInputElement).value
        const updated = this.aggregations().map((a, idx) => (idx === i ? { ...a, alias: value } : a))
        this.aggregations.set(updated)
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
            this.pipelineStore.updateGroupByStep(this.stepIndex(), this.groupByColumns(), updated)
        }, 400)
    }

    // ─── JOIN methods ─────────────────────────────────────────────────────────
    protected setJoinMode(mode: JoinMode): void {
        this.joinMode.set(mode)
        this.pipelineStore.setJoinMode(this.stepIndex(), mode)
    }

    /** Commits the current join config signals via whichever store method matches the active mode. */
    private commitJoinChanges(): void {
        if (this.joinMode() === 'subpipeline') {
            this.pipelineStore.updateSubpipelineJoin(
                this.stepIndex(),
                this.joinType(),
                this.joinSubTable(),
                this.joinSubSteps(),
                this.joinAlias() || undefined,
                this.joinOn(),
            )
        } else {
            this.pipelineStore.updateJoinStep(
                this.stepIndex(),
                this.joinType(),
                this.joinTable(),
                this.joinAlias() || undefined,
                this.joinOn(),
            )
        }
    }

    protected cycleJoinType(): void {
        const next = this.JOIN_TYPES[(this.JOIN_TYPES.indexOf(this.joinType()) + 1) % this.JOIN_TYPES.length]
        this.joinType.set(next)
        this.commitJoinChanges()
    }

    protected onJoinTableChange(event: Event): void {
        const value = (event.target as HTMLSelectElement).value
        this.joinTable.set(value)
        this.commitJoinChanges()
    }

    protected onJoinAliasInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value
        this.joinAlias.set(value)
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => this.commitJoinChanges(), 400)
    }

    protected onJoinOnInput(event: Event): void {
        const value = (event.target as HTMLTextAreaElement).value
        this.joinOn.set(value)
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => this.commitJoinChanges(), 400)
    }

    protected insertJoinColumn(textarea: HTMLTextAreaElement, col: string, qualify: boolean): void {
        const qualifier = qualify ? `${this.joinAlias() || this.joinTable()}.` : ''
        const text = qualifier + col
        const start = textarea.selectionStart ?? textarea.value.length
        const end = textarea.selectionEnd ?? textarea.value.length
        const next = textarea.value.substring(0, start) + text + textarea.value.substring(end)
        this.joinOn.set(next)
        setTimeout(() => {
            textarea.setSelectionRange(start + text.length, start + text.length)
            textarea.focus()
        }, 0)
        this.commitJoinChanges()
    }

    protected onJoinSubTableChange(value: string): void {
        this.joinSubTable.set(value)
        this.commitJoinChanges()
    }

    protected onJoinSubStepsChange(value: PipelineStep[]): void {
        this.joinSubSteps.set(value)
        this.commitJoinChanges()
    }

    // ─── ORDER BY methods ─────────────────────────────────────────────────────
    protected isSortColumn(col: string): boolean {
        return this.sortColumns().some((c) => c.name === col)
    }

    protected addSortColumn(col: string): void {
        if (this.isSortColumn(col)) return
        const updated = [...this.sortColumns(), { name: col, direction: 'ASC' as const }]
        this.sortColumns.set(updated)
        this.pipelineStore.updateOrderByStep(this.stepIndex(), updated, this.limit())
    }

    protected toggleDirection(index: number): void {
        const updated = this.sortColumns().map((c, i) =>
            i === index ? { ...c, direction: (c.direction === 'ASC' ? 'DESC' : 'ASC') as SortColumn['direction'] } : c,
        )
        this.sortColumns.set(updated)
        this.pipelineStore.updateOrderByStep(this.stepIndex(), updated, this.limit())
    }

    protected removeSortColumn(index: number): void {
        const updated = this.sortColumns().filter((_, i) => i !== index)
        this.sortColumns.set(updated)
        this.pipelineStore.updateOrderByStep(this.stepIndex(), updated, this.limit())
    }

    protected onLimitChange(event: Event): void {
        const raw = (event.target as HTMLInputElement).value
        const val = raw === '' ? null : Number(raw)
        this.limit.set(val)
        if (this.limitDebounceTimer) clearTimeout(this.limitDebounceTimer)
        this.limitDebounceTimer = setTimeout(() => {
            this.pipelineStore.updateOrderByStep(this.stepIndex(), this.sortColumns(), val)
        }, 400)
    }

    // ─── Shared ───────────────────────────────────────────────────────────────
    protected isStepEmpty(): boolean {
        const s = this.step()
        if (s.type === 'WHERE') return !this.expression().trim()
        if (s.type === 'ORDER_BY') return this.sortColumns().length === 0 && this.limit() === null
        if (s.type === 'RAW_SQL') return !this.rawSql().trim()
        if (s.type === 'SELECT') return this.selectColumns().length === 0
        if (s.type === 'GROUP_BY') return this.groupByColumns().length === 0
        if (s.type === 'JOIN') {
            const source = this.joinMode() === 'subpipeline' ? this.joinSubTable() : this.joinTable()
            return !source || !this.joinOn().trim()
        }
        return false
    }

    protected removeStep(): void {
        this.pipelineStore.removeStep(this.stepIndex())
    }

    protected isNull(value: unknown): boolean {
        return value === null || value === undefined
    }

    protected formatCell(value: unknown): string {
        if (typeof value === 'object') return JSON.stringify(value)
        return String(value)
    }
}
