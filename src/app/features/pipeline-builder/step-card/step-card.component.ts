import { Component, inject, input, OnInit, signal } from '@angular/core'
import type { PipelineStep } from '@quarrydb/shared'
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

    private debounceTimer: ReturnType<typeof setTimeout> | null = null

    // ─── Lifecycle ────────────────────────────────────────────────────────────
    ngOnInit(): void {
        const s = this.step()
        if (s.type === 'WHERE') this.expression.set(s.expression)
    }

    // ─── Public Methods ───────────────────────────────────────────────────────
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
