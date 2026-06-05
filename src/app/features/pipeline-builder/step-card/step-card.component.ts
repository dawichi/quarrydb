import { Component, inject, input, OnInit, signal } from '@angular/core'
import type { PipelineStep, SortColumn } from '@quarrydb/shared'
import { PipelineStore, type StepResultState } from '../../../core/store/pipeline.store'

@Component({
    selector: 'app-step-card',
    imports: [],
    templateUrl: './step-card.component.html',
})
export class StepCardComponent implements OnInit {
    // ─── Inputs ───────────────────────────────────────────────────────────────
    readonly step = input.required<PipelineStep>()
    readonly stepIndex = input.required<number>()
    readonly result = input.required<StepResultState | undefined>()

    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly pipelineStore = inject(PipelineStore)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly expression = signal('')
    protected readonly sortColumns = signal<SortColumn[]>([])
    protected readonly limit = signal<number | null>(null)

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
