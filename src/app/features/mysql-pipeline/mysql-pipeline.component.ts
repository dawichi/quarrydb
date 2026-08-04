import { Component, effect, inject, signal } from '@angular/core'
import type { SelectColumn, SortColumn } from '@quarrydb/shared'
import { MysqlPipelineStore } from '../../core/store/mysql-pipeline.store'
import { MysqlWorkspaceStore } from '../../core/store/mysql-workspace.store'

@Component({
    selector: 'app-mysql-pipeline',
    templateUrl: './mysql-pipeline.component.html',
    host: { class: 'flex-1 min-h-0' },
})
export class MysqlPipelineComponent {
    protected readonly workspace = inject(MysqlWorkspaceStore)
    protected readonly pipeline = inject(MysqlPipelineStore)
    protected readonly expandedResults = signal<Set<number>>(new Set())

    constructor() {
        effect(() => {
            const session = this.workspace.connectionSession()
            const selected = this.workspace.selectedTable()
            const table = this.workspace.selectedTableSummary()
            if (session && selected && table) {
                this.pipeline.openForTable(
                    session,
                    selected.schemaName,
                    selected.tableName,
                    table.columns.map((column) => column.name),
                )
            } else {
                this.pipeline.clear()
            }
        })
    }

    protected addWhere(): void {
        this.pipeline.addWhereStep()
    }
    protected addSelect(): void {
        this.pipeline.addSelectStep()
    }
    protected addOrderBy(): void {
        this.pipeline.addOrderByStep()
    }
    protected addRawSql(): void {
        this.pipeline.addRawSqlStep()
    }

    protected updateWhere(index: number, event: Event): void {
        this.pipeline.updateWhereStep(index, (event.target as HTMLInputElement).value)
    }

    protected toggleColumn(index: number, name: string): void {
        const step = this.pipeline.steps()[index]
        if (step?.type !== 'SELECT') return
        const columns = step.columns.some((column) => column.expr === name)
            ? step.columns.filter((column) => column.expr !== name)
            : [...step.columns, { expr: name }]
        this.pipeline.updateSelectStep(index, columns)
    }

    protected isSelected(index: number, name: string): boolean {
        const step = this.pipeline.steps()[index]
        return step?.type === 'SELECT' && step.columns.some((column) => column.expr === name)
    }

    protected updateSelectExpr(index: number, columnIndex: number, event: Event): void {
        const step = this.pipeline.steps()[index]
        if (step?.type !== 'SELECT') return
        const columns: SelectColumn[] = step.columns.map((column, i) =>
            i === columnIndex ? { ...column, expr: (event.target as HTMLInputElement).value } : column,
        )
        this.pipeline.updateSelectStep(index, columns)
    }

    protected addCustomColumn(index: number): void {
        const step = this.pipeline.steps()[index]
        if (step?.type === 'SELECT') this.pipeline.updateSelectStep(index, [...step.columns, { expr: '' }])
    }

    protected updateOrderBy(index: number, event: Event): void {
        const step = this.pipeline.steps()[index]
        if (step?.type !== 'ORDER_BY') return
        const name = (event.target as HTMLSelectElement).value
        const columns: SortColumn[] = name ? [{ name, direction: 'ASC' }] : []
        this.pipeline.updateOrderByStep(index, columns, step.limit)
    }

    protected updateLimit(index: number, event: Event): void {
        const step = this.pipeline.steps()[index]
        if (step?.type !== 'ORDER_BY') return
        const raw = (event.target as HTMLInputElement).value
        this.pipeline.updateOrderByStep(index, step.columns, raw ? Number(raw) : null)
    }

    protected updateRawSql(index: number, event: Event): void {
        this.pipeline.updateRawSqlStep(index, (event.target as HTMLTextAreaElement).value)
    }

    protected toggleResult(index: number): void {
        this.expandedResults.update((current) => {
            const next = new Set(current)
            if (next.has(index)) next.delete(index)
            else next.add(index)
            return next
        })
    }

    protected formatCell(value: unknown): string {
        if (value === null || value === undefined) return 'NULL'
        return typeof value === 'object' ? JSON.stringify(value) : String(value)
    }
}
