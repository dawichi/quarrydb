import { Component, inject, signal } from '@angular/core'
import type { WorkspaceTab } from '@quarrydb/shared/session'
import type { ExportFormat } from '../../core/services/export.service'
import { MysqlWorkspaceStore } from '../../core/store/mysql-workspace.store'

@Component({
    selector: 'app-mysql-workspace',
    host: { class: 'flex-1 min-h-0' },
    templateUrl: './mysql-workspace.component.html',
})
export class MysqlWorkspaceComponent {
    protected readonly store = inject(MysqlWorkspaceStore)
    protected readonly tabs: Array<Extract<WorkspaceTab, 'browse' | 'query'>> = ['browse', 'query']
    protected readonly showExportMenu = signal(false)

    protected formatCell(value: unknown): string {
        if (value === null || value === undefined) {
            return 'NULL'
        }
        if (typeof value === 'object') {
            return JSON.stringify(value)
        }
        return String(value)
    }

    protected formatTotal(value: number): string {
        return value.toLocaleString()
    }

    protected selectedSchemaLabel(): string {
        return this.store.selectedSchemaName() ?? 'current schema'
    }

    protected exportAs(format: ExportFormat): void {
        this.showExportMenu.set(false)
        if (this.store.activeTab() === 'browse') {
            void this.store.exportTable(format)
        } else {
            void this.store.exportQuery(format)
        }
    }
}
