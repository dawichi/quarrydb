import { Component, inject, signal } from '@angular/core'
import type { TriggerSchema, ViewSchema } from '@quarrydb/shared'
import { WorkspaceStore } from '../../core/store/workspace.store'

@Component({
    selector: 'app-sidebar',
    templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)

    // ─── State ────────────────────────────────────────────────────────────────
    private readonly expandedTables = signal<Set<string>>(new Set())
    private readonly expandedSections = signal<Set<string>>(new Set())
    private readonly expandedViews = signal<Set<string>>(new Set())
    private readonly expandedTriggers = signal<Set<string>>(new Set())

    // ─── Public Methods ───────────────────────────────────────────────────────
    protected isExpanded(tableName: string): boolean {
        return this.expandedTables().has(tableName)
    }

    protected onTableClick(alias: string, tableName: string): void {
        this.toggleTable(tableName)
        void this.workspaceStore.selectTable(alias, tableName)
    }

    protected isSelectedTable(alias: string, tableName: string): boolean {
        const sel = this.workspaceStore.selectedTable()
        return sel?.schemaAlias === alias && sel?.tableName === tableName
    }

    protected toggleTable(tableName: string): void {
        this.expandedTables.set(this.toggled(this.expandedTables(), tableName))
    }

    /** Section keys are namespaced per-schema (`<alias>:views`) so two attached files don't collide. */
    protected isSectionExpanded(alias: string, section: 'views' | 'triggers'): boolean {
        return this.expandedSections().has(`${alias}:${section}`)
    }

    protected toggleSection(alias: string, section: 'views' | 'triggers'): void {
        this.expandedSections.set(this.toggled(this.expandedSections(), `${alias}:${section}`))
    }

    protected isViewExpanded(viewName: string): boolean {
        return this.expandedViews().has(viewName)
    }

    protected toggleView(viewName: string): void {
        this.expandedViews.set(this.toggled(this.expandedViews(), viewName))
    }

    protected isTriggerExpanded(triggerName: string): boolean {
        return this.expandedTriggers().has(triggerName)
    }

    protected toggleTrigger(triggerName: string): void {
        this.expandedTriggers.set(this.toggled(this.expandedTriggers(), triggerName))
    }

    protected openSettings(alias: string, tableName: string, event: Event): void {
        event.stopPropagation()
        this.workspaceStore.openTableSettings(alias, tableName)
    }

    protected openViewEdit(alias: string, view: ViewSchema, event: Event): void {
        event.stopPropagation()
        this.workspaceStore.openEditView(alias, view)
    }

    protected openTriggerEdit(alias: string, trigger: TriggerSchema, event: Event): void {
        event.stopPropagation()
        this.workspaceStore.openEditTrigger(alias, trigger)
    }

    protected getFileName(path: string): string {
        return path.split('/').pop() ?? path
    }

    protected formatCount(count: number): string {
        if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
        return String(count)
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────
    private toggled(set: Set<string>, key: string): Set<string> {
        const next = new Set(set)
        if (next.has(key)) {
            next.delete(key)
        } else {
            next.add(key)
        }
        return next
    }
}
