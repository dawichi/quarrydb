import { Injectable, effect, inject, signal } from '@angular/core'
import { PipelineStore } from '../store/pipeline.store'
import { WorkspaceStore } from '../store/workspace.store'

export type TutorialStep = 0 | 1 | 2 | 3 | 4 | 5

const STORAGE_KEY = 'quarry_tutorial_done'

@Injectable({ providedIn: 'root' })
export class TutorialService {
    private readonly workspaceStore = inject(WorkspaceStore)
    private readonly pipelineStore = inject(PipelineStore)

    readonly step = signal<TutorialStep>(0)

    constructor() {
        // Auto-advance based on user actions in the app
        effect(() => {
            const s = this.step()
            if (s === 1 && this.workspaceStore.hasWorkspace()) this.next()
            if (s === 2 && this.workspaceStore.selectedTable()) this.next()
            if (s === 3 && this.pipelineStore.steps().length > 0) this.next()
        })
    }

    get isDone(): boolean {
        return !!localStorage.getItem(STORAGE_KEY)
    }

    start(): void {
        this.step.set(1)
    }

    next(): void {
        const s = this.step()
        if (s > 0 && s < 5) this.step.set((s + 1) as TutorialStep)
    }

    finish(): void {
        this.step.set(5)
        localStorage.setItem(STORAGE_KEY, '1')
    }

    skip(): void {
        this.step.set(0)
        localStorage.setItem(STORAGE_KEY, '1')
    }
}
