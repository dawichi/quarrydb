import { computed, Injectable, inject, signal } from '@angular/core'
import type { Aggregation, JoinType, PipelineStep, SelectColumn, SortColumn } from '@quarrydb/shared'
import { buildPipelineSql } from '@quarrydb/shared/pipeline-sql'
import type { MysqlConnectionSession } from '../providers/mysql-backend-adapter'
import { MysqlBackendAdapterService } from '../providers/mysql-backend-adapter.service'
import type { ExportFormat } from '../services/export.service'
import { ExportService } from '../services/export.service'

export interface MysqlPipelineResult {
    rows: Record<string, unknown>[]
    columns: string[]
    error: string | null
    isLoading: boolean
}

interface MysqlPipelineSource {
    connectionId: string
    schemaName: string
    tableName: string
    columns: string[]
}

const EMPTY_RESULT: MysqlPipelineResult = { rows: [], columns: [], error: null, isLoading: false }

@Injectable({ providedIn: 'root' })
export class MysqlPipelineStore {
    private readonly backend = inject(MysqlBackendAdapterService)
    private readonly exportService = inject(ExportService)

    readonly source = signal<MysqlPipelineSource | null>(null)
    readonly steps = signal<PipelineStep[]>([])
    readonly stepResults = signal<MysqlPipelineResult[]>([])
    readonly variableValues = signal<Record<string, string>>({})
    readonly isRunning = signal(false)
    readonly error = signal<string | null>(null)
    readonly generatedSql = computed(() => {
        const source = this.source()
        return source
            ? buildPipelineSql(`${source.schemaName}.${source.tableName}`, this.steps(), this.variableValues(), 'mysql')
            : ''
    })

    private session: MysqlConnectionSession | null = null
    private sourceKey = ''

    openForTable(session: MysqlConnectionSession, schemaName: string, tableName: string, columns: string[]): void {
        const key = `${session.target.connectionId}:${schemaName}.${tableName}`
        if (this.sourceKey === key) return

        this.session = session
        this.sourceKey = key
        this.source.set({ connectionId: session.target.connectionId, schemaName, tableName, columns })
        this.steps.set([])
        this.stepResults.set([])
        this.variableValues.set({})
        this.error.set(null)
    }

    clear(): void {
        this.session = null
        this.sourceKey = ''
        this.source.set(null)
        this.steps.set([])
        this.stepResults.set([])
        this.error.set(null)
        this.isRunning.set(false)
    }

    restoreState(steps: PipelineStep[], variableValues: Record<string, string>): void {
        this.steps.set(steps.map((step) => ({ ...step })))
        this.stepResults.set(steps.map(() => ({ ...EMPTY_RESULT })))
        this.variableValues.set({ ...variableValues })
        void this.execute()
    }

    async exportResult(format: ExportFormat): Promise<void> {
        const session = this.session
        const source = this.source()
        if (!session || !source || this.isRunning()) return

        this.isRunning.set(true)
        this.error.set(null)
        try {
            const rows = await this.backend.runQueryFull(session, this.generatedSql())
            const columns = rows.length > 0 ? Object.keys(rows[0]) : source.columns
            await this.exportService.saveFile(
                this.exportContent(format, columns, rows),
                `${source.tableName}_pipeline.${format === 'md' ? 'md' : format}`,
                format,
            )
        } catch (error) {
            this.error.set(error instanceof Error ? error.message : String(error))
        } finally {
            this.isRunning.set(false)
        }
    }

    addWhereStep(): void {
        this.add({ id: crypto.randomUUID(), type: 'WHERE', expression: '' })
    }

    addSelectStep(): void {
        this.add({ id: crypto.randomUUID(), type: 'SELECT', columns: [] })
    }

    addOrderByStep(): void {
        this.add({ id: crypto.randomUUID(), type: 'ORDER_BY', columns: [], limit: null })
    }

    addRawSqlStep(): void {
        this.add({ id: crypto.randomUUID(), type: 'RAW_SQL', sql: '' })
    }

    addGroupByStep(): void {
        this.add({ id: crypto.randomUUID(), type: 'GROUP_BY', groupBy: [], aggregations: [] })
    }

    addJoinStep(): void {
        this.add({ id: crypto.randomUUID(), type: 'JOIN', mode: 'inline', joinType: 'INNER', table: '', on: '' })
    }

    updateWhereStep(index: number, expression: string): void {
        this.update(index, (step) => (step.type === 'WHERE' ? { ...step, expression } : step))
    }

    updateSelectStep(index: number, columns: SelectColumn[]): void {
        this.update(index, (step) => (step.type === 'SELECT' ? { ...step, columns } : step))
    }

    updateOrderByStep(index: number, columns: SortColumn[], limit: number | null): void {
        this.update(index, (step) => (step.type === 'ORDER_BY' ? { ...step, columns, limit } : step))
    }

    updateRawSqlStep(index: number, sql: string): void {
        this.update(index, (step) => (step.type === 'RAW_SQL' ? { ...step, sql } : step))
    }

    updateGroupByStep(index: number, groupBy: string[], aggregations: Aggregation[]): void {
        this.update(index, (step) => (step.type === 'GROUP_BY' ? { ...step, groupBy, aggregations } : step))
    }

    updateJoinStep(index: number, joinType: JoinType, table: string, on: string): void {
        this.update(index, (step) => (step.type === 'JOIN' ? { ...step, joinType, table, on } : step))
    }

    removeStep(index: number): void {
        this.steps.update((steps) => steps.filter((_, i) => i !== index))
        this.stepResults.update((results) => results.filter((_, i) => i !== index))
        void this.execute()
    }

    setVariableValue(name: string, value: string): void {
        this.variableValues.update((values) => ({ ...values, [name]: value }))
        void this.execute()
    }

    reExecute(): void {
        void this.execute()
    }

    private add(step: PipelineStep): void {
        this.steps.update((steps) => [...steps, step])
        this.stepResults.update((results) => [...results, { ...EMPTY_RESULT }])
        void this.execute()
    }

    private update(index: number, transform: (step: PipelineStep) => PipelineStep): void {
        this.steps.update((steps) => steps.map((step, i) => (i === index ? transform(step) : step)))
        void this.execute()
    }

    private async execute(): Promise<void> {
        const session = this.session
        const source = this.source()
        if (!session || !source || this.isRunning()) return

        this.isRunning.set(true)
        this.error.set(null)
        const steps = this.steps()
        this.stepResults.set(steps.map(() => ({ ...EMPTY_RESULT, isLoading: true })))
        try {
            for (let index = 0; index < steps.length; index++) {
                const sql = buildPipelineSql(
                    `${source.schemaName}.${source.tableName}`,
                    steps.slice(0, index + 1),
                    this.variableValues(),
                    'mysql',
                )
                try {
                    const result = await this.backend.runQuery(session, sql, 50)
                    this.stepResults.update((current) =>
                        current.map((value, i) =>
                            i === index
                                ? { rows: result.rows, columns: result.columns, error: null, isLoading: false }
                                : value,
                        ),
                    )
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    this.stepResults.update((current) =>
                        current.map((value, i) =>
                            i >= index
                                ? {
                                      ...value,
                                      error: i === index ? message : 'Blocked by upstream error',
                                      isLoading: false,
                                  }
                                : value,
                        ),
                    )
                    break
                }
            }
        } finally {
            this.isRunning.set(false)
        }
    }

    private exportContent(format: ExportFormat, columns: string[], rows: Record<string, unknown>[]): string {
        switch (format) {
            case 'csv':
                return this.exportService.toCsv(columns, rows)
            case 'json':
                return this.exportService.toJson(rows)
            case 'sql':
                return this.exportService.toSqlInserts(this.source()?.tableName ?? 'pipeline_result', columns, rows)
            case 'md':
                return this.exportService.toMarkdown(columns, rows)
        }
    }
}
