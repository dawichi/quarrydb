import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core'
import type { MysqlWorkspaceTab } from '@quarrydb/shared/session'
import type { MysqlTableBrowseOptions } from '../../core/providers/mysql-backend-adapter'
import { MysqlProviderService } from '../../core/providers/mysql-provider.service'
import type { ExportFormat } from '../../core/services/export.service'
import { MysqlWorkspaceStore } from '../../core/store/mysql-workspace.store'
import { WorkspaceHostStore } from '../../core/store/workspace-host.store'
import { MysqlPipelineComponent } from '../mysql-pipeline/mysql-pipeline.component'

@Component({
    selector: 'app-mysql-workspace',
    imports: [MysqlPipelineComponent],
    host: { class: 'flex-1 min-h-0' },
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './mysql-workspace.component.html',
})
export class MysqlWorkspaceComponent {
    protected readonly store = inject(MysqlWorkspaceStore)
    protected readonly provider = inject(MysqlProviderService)
    protected readonly workspaceHost = inject(WorkspaceHostStore)
    protected readonly tabs: MysqlWorkspaceTab[] = ['browse', 'query', 'edit', 'pipeline']
    protected readonly activeView = signal<'browse' | 'query' | 'edit' | 'pipeline'>('browse')
    protected readonly showExportMenu = signal(false)
    protected readonly browseFilterInput = signal('')
    protected readonly browseSortInput = signal('')
    protected readonly browseSortDirectionInput = signal<'asc' | 'desc'>('asc')

    constructor() {
        effect(() => {
            const tab = this.store.activeTab()
            if (this.activeView() !== 'pipeline') this.activeView.set(tab)
        })
    }

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

    protected applyBrowseOptions(): void {
        const options: MysqlTableBrowseOptions = {
            filter: this.browseFilterInput(),
            sortColumn: this.browseSortInput() || undefined,
            sortDirection: this.browseSortDirectionInput(),
        }
        this.store.applyBrowseOptions(options)
    }

    protected exportAs(format: ExportFormat): void {
        this.showExportMenu.set(false)
        if (this.store.activeTab() === 'browse') {
            void this.store.exportTable(format)
        } else if (this.store.activeTab() === 'query') {
            void this.store.exportQuery(format)
        }
    }

    protected reconnect(): void {
        void this.provider.connectWorkspaceDraft().catch(() => undefined)
    }

    protected selectView(view: 'browse' | 'query' | 'edit' | 'pipeline'): void {
        this.activeView.set(view)
        this.store.setActiveTab(view)
    }

    protected readonly editingCell = signal<{ rowIndex: number; column: string } | null>(null)
    protected readonly editValue = signal('')

    protected pkColumns(): string[] {
        return (
            this.store
                .selectedTableSummary()
                ?.columns.filter((column) => column.primaryKey)
                .map((column) => column.name) ?? []
        )
    }

    protected editableColumns(): string[] {
        return (
            this.store
                .selectedTableSummary()
                ?.columns.filter((column) => !column.primaryKey)
                .map((column) => column.name) ?? []
        )
    }

    protected getPkValues(row: Record<string, unknown>): Record<string, unknown> {
        return Object.fromEntries(this.pkColumns().map((column) => [column, row[column]]))
    }

    protected startEdit(rowIndex: number, column: string): void {
        if (this.pkColumns().includes(column)) return
        const row = this.store.tableRows()[rowIndex]
        if (this.store.editStore.isRowDeleted(this.getPkValues(row))) return
        this.editingCell.set({ rowIndex, column })
        const value = this.store.editStore.getRowUpdate(this.getPkValues(row))?.changes[column] ?? row[column]
        this.editValue.set(value === null || value === undefined ? '' : String(value))
    }

    protected commitEdit(): void {
        const cell = this.editingCell()
        if (!cell) return
        const row = this.store.tableRows()[cell.rowIndex]
        const original = row[cell.column]
        const value = this.parseValue(this.editValue(), original)
        if (value !== original) {
            this.store.editStore.stageUpdate(this.getPkValues(row), cell.column, value, row)
        }
        this.editingCell.set(null)
    }

    protected cancelEdit(): void {
        this.editingCell.set(null)
    }

    protected isEditing(rowIndex: number, column: string): boolean {
        const cell = this.editingCell()
        return cell?.rowIndex === rowIndex && cell.column === column
    }

    protected displayValue(row: Record<string, unknown>, column: string): unknown {
        return this.store.editStore.getRowUpdate(this.getPkValues(row))?.changes[column] ?? row[column]
    }

    protected isModified(row: Record<string, unknown>, column: string): boolean {
        return this.store.editStore.getRowUpdate(this.getPkValues(row))?.changes[column] !== undefined
    }

    protected stageDelete(rowIndex: number): void {
        const row = this.store.tableRows()[rowIndex]
        this.store.editStore.stageDelete(this.getPkValues(row), row)
    }

    protected formatEditValues(values: Record<string, unknown>): string {
        return Object.entries(values)
            .map(([key, value]) => `${key} → ${value}`)
            .join(', ')
    }

    protected async applyEdits(): Promise<void> {
        await this.store.applyPendingEdits()
    }

    private parseValue(raw: string, original: unknown): unknown {
        if (raw === '' && (original === null || original === undefined)) return null
        if (typeof original === 'number') {
            const number = Number(raw)
            return Number.isNaN(number) ? raw : number
        }
        return raw
    }
}
