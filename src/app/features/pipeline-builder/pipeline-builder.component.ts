import { Component, effect, inject, signal } from '@angular/core'
import { PipelineStore } from '../../core/store/pipeline.store'
import { WorkspaceStore } from '../../core/store/workspace.store'
import { StepCardComponent } from './step-card/step-card.component'

@Component({
    selector: 'app-pipeline-builder',
    imports: [StepCardComponent],
    templateUrl: './pipeline-builder.component.html',
})
export class PipelineBuilderComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly pipelineStore = inject(PipelineStore)
    protected readonly workspaceStore = inject(WorkspaceStore)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly showPicker = signal(false)
    protected readonly sqlPanelOpen = signal(true)
    protected readonly copied = signal(false)

    constructor() {
        // Initialize pipeline whenever the selected table changes
        effect(() => {
            const sel = this.workspaceStore.selectedTable()
            if (!sel) return
            const schema = this.workspaceStore.schemas().find((s) => s.alias === sel.schemaAlias)
            const table = schema?.tables.find((t) => t.name === sel.tableName)
            if (!schema || !table) return
            void this.pipelineStore.openForTable(
                schema.path,
                sel.schemaAlias,
                sel.tableName,
                table.columns.map((c) => c.name),
            )
        })
    }

    // ─── Public Methods ───────────────────────────────────────────────────────
    protected addWhereStep(): void {
        this.pipelineStore.addStep()
        this.showPicker.set(false)
    }

    protected async copySql(): Promise<void> {
        await navigator.clipboard.writeText(this.pipelineStore.generatedSql())
        this.copied.set(true)
        setTimeout(() => this.copied.set(false), 1500)
    }
}
