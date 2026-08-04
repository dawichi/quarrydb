// ─── Pipeline Steps ───────────────────────────────────────────────────────────

export type StepType = 'WHERE' | 'SELECT' | 'ORDER_BY' | 'GROUP_BY' | 'JOIN' | 'RAW_SQL'

export interface BaseStep {
    id: string
    type: StepType
}

export interface WhereStep extends BaseStep {
    type: 'WHERE'
    expression: string
}

export interface SelectColumn {
    expr: string
    alias?: string
}

export interface SelectStep extends BaseStep {
    type: 'SELECT'
    columns: SelectColumn[]
}

export interface SortColumn {
    name: string
    direction: 'ASC' | 'DESC'
}

export interface OrderByStep extends BaseStep {
    type: 'ORDER_BY'
    columns: SortColumn[]
    limit: number | null
}

export type AggFn = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'

export interface Aggregation {
    fn: AggFn
    expr: string
    alias: string
}

export interface GroupByStep extends BaseStep {
    type: 'GROUP_BY'
    groupBy: string[]
    aggregations: Aggregation[]
}

export type JoinMode = 'inline' | 'branch' | 'subpipeline'
export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'

export interface JoinStep extends BaseStep {
    type: 'JOIN'
    mode: JoinMode
    joinType: JoinType
    table: string
    alias?: string
    on: string
    /** Subpipeline mode: source table for the nested pipeline. */
    subTable?: string
    /** Subpipeline mode: steps applied to `subTable` before joining. May not itself contain a subpipeline-mode JOIN. */
    subSteps?: PipelineStep[]
}

export interface RawSqlStep extends BaseStep {
    type: 'RAW_SQL'
    sql: string
}

export type PipelineStep = WhereStep | SelectStep | OrderByStep | GroupByStep | JoinStep | RawSqlStep

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export interface PipelineVariable {
    name: string
    defaultValue?: string
}

export interface Pipeline {
    id: string
    name: string
    description?: string
    fromTable: string
    steps: PipelineStep[]
    variables?: PipelineVariable[]
    createdAt: number
    updatedAt: number
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface Column {
    name: string
    type: string
    nullable: boolean
    primaryKey: boolean
    defaultValue?: string
}

export interface Index {
    name: string
    columns: string[]
    unique: boolean
}

export interface ForeignKey {
    column: string
    referencesTable: string
    referencesColumn: string
}

export interface TableSchema {
    name: string
    columns: Column[]
    indexes: Index[]
    foreignKeys: ForeignKey[]
    rowCount?: number
}

export interface ViewSchema {
    name: string
    sql: string
}

export interface TriggerSchema {
    name: string
    table: string
    sql: string
}

export interface DatabaseSchema {
    path: string
    alias: string
    tables: TableSchema[]
    views: ViewSchema[]
    triggers: TriggerSchema[]
}

// ─── Query Result ─────────────────────────────────────────────────────────────

export interface QueryResult {
    columns: string[]
    rows: Record<string, unknown>[]
    totalRows: number
    isCapped: boolean
    durationMs: number
    generatedSql: string
}

export interface StepResult {
    stepId: string
    result: QueryResult | null
    error: string | null
    isBlocked: boolean
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface DatabaseConnection {
    path: string
    alias: string
}

export interface Workspace {
    id: string
    name: string
    databases: DatabaseConnection[]
    createdAt: number
    updatedAt: number
}

export * from './pipeline-sql'
