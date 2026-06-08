import { Component, effect, HostListener, inject, signal } from '@angular/core'
import type { ExportFormat } from '../../core/services/export.service'
import type { QueryHistoryEntry } from '../../core/services/query-history.service'
import { QueryHistoryService } from '../../core/services/query-history.service'
import type { SavedQuery } from '../../core/services/saved-queries.service'
import { SavedQueriesService } from '../../core/services/saved-queries.service'
import { PipelineStore } from '../../core/store/pipeline.store'
import { WorkspaceStore } from '../../core/store/workspace.store'
import { StepCardComponent } from './step-card/step-card.component'

@Component({
    selector: 'app-pipeline-builder',
    imports: [StepCardComponent],
    host: { class: 'flex-1 min-h-0' },
    templateUrl: './pipeline-builder.component.html',
})
export class PipelineBuilderComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly pipelineStore = inject(PipelineStore)
    protected readonly workspaceStore = inject(WorkspaceStore)
    private readonly savedQueriesSvc = inject(SavedQueriesService)
    private readonly queryHistorySvc = inject(QueryHistoryService)

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly showPicker = signal(false)
    protected readonly sqlPanelOpen = signal(true)
    protected readonly copied = signal(false)
    protected readonly showExportMenu = signal(false)
    protected readonly stepDragIndex = signal<number | null>(null)
    protected readonly stepDropTarget = signal<number | null>(null)
    protected readonly showSaveModal = signal(false)
    protected readonly saveQueryName = signal('')
    protected readonly showQueriesPanel = signal(false)
    protected readonly savedQueries = signal<SavedQuery[]>([])
    protected readonly showHistoryPanel = signal(false)
    protected readonly historyEnabled = signal(false)
    protected readonly historyEntries = signal<QueryHistoryEntry[]>([])
    protected readonly historySearch = signal('')
    private varDebounce: ReturnType<typeof setTimeout> | null = null

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

    // ─── Add step ─────────────────────────────────────────────────────────────
    protected addWhereStep(): void {
        this.pipelineStore.addStep()
        this.showPicker.set(false)
    }
    protected addOrderByStep(): void {
        this.pipelineStore.addOrderByStep()
        this.showPicker.set(false)
    }
    protected addSelectStep(): void {
        this.pipelineStore.addSelectStep()
        this.showPicker.set(false)
    }
    protected addRawSqlStep(): void {
        this.pipelineStore.addRawSqlStep()
        this.showPicker.set(false)
    }
    protected addGroupByStep(): void {
        this.pipelineStore.addGroupByStep()
        this.showPicker.set(false)
    }
    protected addJoinStep(): void {
        this.pipelineStore.addJoinStep()
        this.showPicker.set(false)
    }

    // ─── Keyboard ─────────────────────────────────────────────────────────────
    @HostListener('document:keydown', ['$event'])
    protected onKeydown(event: KeyboardEvent): void {
        if (!(event.ctrlKey || event.metaKey) || event.key !== 'z') return
        event.preventDefault()
        if (event.shiftKey) this.pipelineStore.redo()
        else this.pipelineStore.undo()
    }

    // ─── Drag reorder ─────────────────────────────────────────────────────────
    protected onStepGripMouseDown(event: MouseEvent, i: number): void {
        event.preventDefault()
        this.stepDragIndex.set(i)
        this.stepDropTarget.set(i)
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
        const cleanup = () => {
            const from = this.stepDragIndex()
            const to = this.stepDropTarget()
            this.stepDragIndex.set(null)
            this.stepDropTarget.set(null)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            if (from !== null && to !== null && from !== to) {
                this.pipelineStore.reorderSteps(from, to)
            }
            document.removeEventListener('mouseup', cleanup)
        }
        document.addEventListener('mouseup', cleanup)
    }

    protected onStepRowMouseEnter(i: number): void {
        if (this.stepDragIndex() !== null) this.stepDropTarget.set(i)
    }

    // ─── SQL panel ────────────────────────────────────────────────────────────
    protected async copySql(): Promise<void> {
        await navigator.clipboard.writeText(this.pipelineStore.generatedSql())
        this.copied.set(true)
        setTimeout(() => this.copied.set(false), 1500)
    }

    protected exportAs(format: ExportFormat): void {
        this.showExportMenu.set(false)
        void this.pipelineStore.exportResult(format)
    }

    // ─── Variables ────────────────────────────────────────────────────────────
    protected onVariableInput(name: string, value: string): void {
        this.pipelineStore.setVariableValue(name, value)
        if (this.varDebounce) clearTimeout(this.varDebounce)
        this.varDebounce = setTimeout(() => this.pipelineStore.reExecute(), 400)
    }

    // ─── Saved queries ────────────────────────────────────────────────────────
    protected openQueriesPanel(): void {
        const tableName = this.pipelineStore.source()?.tableName ?? ''
        this.savedQueries.set(this.savedQueriesSvc.forTable(tableName))
        this.showQueriesPanel.set(!this.showQueriesPanel())
        this.showSaveModal.set(false)
    }

    protected openSaveModal(): void {
        this.showSaveModal.set(!this.showSaveModal())
        this.showQueriesPanel.set(false)
    }

    protected saveQuery(): void {
        const name = this.saveQueryName().trim()
        const src = this.pipelineStore.source()
        if (!name || !src) return
        const query: SavedQuery = {
            id: crypto.randomUUID(),
            name,
            source: { path: src.path, alias: src.alias, tableName: src.tableName, columns: src.columns },
            steps: [...this.pipelineStore.steps()],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        }
        this.savedQueriesSvc.save(query)
        this.saveQueryName.set('')
        this.showSaveModal.set(false)
    }

    protected loadQuery(query: SavedQuery): void {
        this.showQueriesPanel.set(false)
        void this.pipelineStore.loadSavedQuery(query)
    }

    protected deleteQuery(id: string, event: MouseEvent): void {
        event.stopPropagation()
        this.savedQueriesSvc.delete(id)
        const tableName = this.pipelineStore.source()?.tableName ?? ''
        this.savedQueries.set(this.savedQueriesSvc.forTable(tableName))
    }

    // ─── Query history ────────────────────────────────────────────────────────
    protected openHistoryPanel(): void {
        this.historyEnabled.set(this.queryHistorySvc.isEnabled())
        this.refreshHistory()
        this.showHistoryPanel.set(!this.showHistoryPanel())
        this.showQueriesPanel.set(false)
        this.showSaveModal.set(false)
    }

    protected enableHistory(): void {
        this.queryHistorySvc.setEnabled(true)
        this.historyEnabled.set(true)
        this.refreshHistory()
    }

    protected onHistorySearchInput(value: string): void {
        this.historySearch.set(value)
        this.refreshHistory()
    }

    protected loadHistoryEntry(entry: QueryHistoryEntry): void {
        this.showHistoryPanel.set(false)
        void this.pipelineStore.loadHistoryEntry(entry)
    }

    protected clearHistory(): void {
        this.queryHistorySvc.clear()
        this.refreshHistory()
    }

    private refreshHistory(): void {
        // Newest first — that's what a history list is for.
        this.historyEntries.set(this.queryHistorySvc.search(this.historySearch()).reverse())
    }

    protected historyTimeLabel(executedAt: number): string {
        return new Date(executedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
}
