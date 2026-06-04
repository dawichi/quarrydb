import { Component, inject, signal } from '@angular/core'
import { WorkspaceStore } from '../../core/store/workspace.store'

@Component({
    selector: 'app-sidebar',
    templateUrl: './sidebar.component.html',
    styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    protected readonly workspaceStore = inject(WorkspaceStore)

    // ─── State ────────────────────────────────────────────────────────────────
    private readonly expandedTables = signal<Set<string>>(new Set())

    // ─── Public Methods ───────────────────────────────────────────────────────
    protected isExpanded(tableName: string): boolean {
        return this.expandedTables().has(tableName)
    }

    protected toggleTable(tableName: string): void {
        const next = new Set(this.expandedTables())
        if (next.has(tableName)) {
            next.delete(tableName)
        } else {
            next.add(tableName)
        }
        this.expandedTables.set(next)
    }

    protected getFileName(path: string): string {
        return path.split('/').pop() ?? path
    }

    protected formatCount(count: number): string {
        if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
        return String(count)
    }
}
