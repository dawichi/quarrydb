import type { PipelineStep } from '@quarrydb/shared'
import type {
    MysqlPersistedSession,
    MysqlWorkspaceSessionState,
    PersistedSession,
    RedisPersistedSession,
    RedisWorkspaceSessionState,
    SqlitePersistedSession,
} from '@quarrydb/shared/session'

type UnknownRecord = Record<string, unknown>

const STEP_TYPES = new Set(['WHERE', 'SELECT', 'ORDER_BY', 'GROUP_BY', 'JOIN', 'RAW_SQL'])
const JOIN_MODES = new Set(['inline', 'branch', 'subpipeline'])
const JOIN_TYPES = new Set(['INNER', 'LEFT', 'RIGHT', 'FULL'])
const AGGREGATION_FUNCTIONS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'])
const WORKSPACE_TABS = new Set(['browse', 'query', 'edit'])
const MYSQL_WORKSPACE_TABS = new Set(['browse', 'query', 'edit', 'pipeline'])
const REDIS_WORKSPACE_TABS = new Set(['keys', 'command'])

export function isPersistedSession(value: unknown): value is PersistedSession {
    if (!isRecord(value) || value.version !== 1 || !isFiniteNumber(value.savedAt)) return false

    switch (value.providerId) {
        case 'sqlite':
            return isSqliteSession(value)
        case 'mysql':
            return isMysqlSession(value)
        case 'redis':
            return isRedisSession(value)
        default:
            return false
    }
}

export function isLegacyPersistedSession(value: unknown): value is LegacyPersistedSession {
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.databases) || value.databases.length === 0) {
        return false
    }

    return (
        value.databases.every(isSqliteDatabase) &&
        isWorkspaceTab(value.activeTab) &&
        (value.selectedTable === null || isSqliteSelection(value.selectedTable)) &&
        isSqlitePipeline(value.pipeline)
    )
}

export interface LegacyPersistedSession {
    version: 1
    databases: Array<{ path: string; alias: string }>
    activeTab: 'browse' | 'query' | 'edit'
    selectedTable: { schemaAlias: string; tableName: string } | null
    pipeline: {
        source: { path: string; alias: string; tableName: string; columns: string[] } | null
        steps: PipelineStep[]
        variableValues: Record<string, string>
    }
}

function isSqliteSession(value: UnknownRecord): value is SqlitePersistedSession {
    return (
        value.providerId === 'sqlite' &&
        isRecord(value.workspace) &&
        typeof value.workspace.name === 'string' &&
        Array.isArray(value.workspace.databases) &&
        value.workspace.databases.length > 0 &&
        value.workspace.databases.every(isSqliteDatabase) &&
        (value.workspace.selectedTable === undefined ||
            value.workspace.selectedTable === null ||
            isSqliteSelection(value.workspace.selectedTable)) &&
        (value.workspace.activeTab === undefined || isWorkspaceTab(value.workspace.activeTab)) &&
        isSqlitePipeline(value.pipeline)
    )
}

function isMysqlSession(value: UnknownRecord): value is MysqlPersistedSession {
    return (
        value.providerId === 'mysql' &&
        isMysqlTarget(value.workspace) &&
        (value.workspace.selectedTable === undefined ||
            value.workspace.selectedTable === null ||
            isMysqlSelection(value.workspace.selectedTable)) &&
        (value.workspace.activeTab === undefined || MYSQL_WORKSPACE_TABS.has(value.workspace.activeTab as string)) &&
        isMysqlPipeline(value.pipeline)
    )
}

function isRedisSession(value: UnknownRecord): value is RedisPersistedSession {
    return (
        value.providerId === 'redis' &&
        isRedisTarget(value.workspace) &&
        (value.workspace.selectedKey === undefined ||
            value.workspace.selectedKey === null ||
            typeof value.workspace.selectedKey === 'string') &&
        (value.workspace.keyPattern === undefined || typeof value.workspace.keyPattern === 'string') &&
        (value.workspace.activeTab === undefined || REDIS_WORKSPACE_TABS.has(value.workspace.activeTab as string))
    )
}

function isSqliteDatabase(value: unknown): value is { path: string; alias: string } {
    return isRecord(value) && isNonEmptyString(value.path) && isNonEmptyString(value.alias)
}

function isSqliteSelection(value: unknown): value is { schemaAlias: string; tableName: string } {
    return isRecord(value) && isNonEmptyString(value.schemaAlias) && isNonEmptyString(value.tableName)
}

function isMysqlSelection(value: unknown): value is { schemaName: string; tableName: string } {
    return isRecord(value) && isNonEmptyString(value.schemaName) && isNonEmptyString(value.tableName)
}

function isMysqlTarget(value: unknown): value is MysqlWorkspaceSessionState {
    return (
        isRecord(value) &&
        isNonEmptyString(value.connectionId) &&
        isNonEmptyString(value.connectionName) &&
        isNonEmptyString(value.host) &&
        isPort(value.port) &&
        (value.defaultDatabase === undefined || typeof value.defaultDatabase === 'string')
    )
}

function isRedisTarget(value: unknown): value is RedisWorkspaceSessionState {
    return (
        isRecord(value) &&
        isNonEmptyString(value.connectionId) &&
        isNonEmptyString(value.connectionName) &&
        isNonEmptyString(value.host) &&
        isPort(value.port) &&
        Number.isInteger(value.database) &&
        (value.database as number) >= 0 &&
        (value.database as number) <= 255 &&
        typeof value.tls === 'boolean' &&
        (value.username === undefined || typeof value.username === 'string')
    )
}

function isSqlitePipeline(value: unknown): boolean {
    if (!isRecord(value) || !Array.isArray(value.steps) || !value.steps.every(isPipelineStep)) return false
    if (!isStringRecord(value.variableValues)) return false
    return value.source === null || value.source === undefined || isPipelineSource(value.source, 'sqlite')
}

function isMysqlPipeline(value: unknown): boolean {
    if (!isRecord(value) || !Array.isArray(value.steps) || !value.steps.every(isPipelineStep)) return false
    if (!isStringRecord(value.variableValues)) return false
    return value.source === null || value.source === undefined || isPipelineSource(value.source, 'mysql')
}

function isPipelineSource(value: unknown, provider: 'sqlite' | 'mysql'): boolean {
    if (!isRecord(value) || !isNonEmptyString(value.tableName) || !Array.isArray(value.columns)) return false
    if (!value.columns.every((column) => typeof column === 'string')) return false
    return provider === 'sqlite'
        ? isNonEmptyString(value.path) && isNonEmptyString(value.alias)
        : isNonEmptyString(value.connectionId) && isNonEmptyString(value.schemaName)
}

function isPipelineStep(value: unknown): value is PipelineStep {
    if (
        !isRecord(value) ||
        !isNonEmptyString(value.id) ||
        typeof value.type !== 'string' ||
        !STEP_TYPES.has(value.type)
    ) {
        return false
    }

    switch (value.type) {
        case 'WHERE':
            return typeof value.expression === 'string'
        case 'SELECT':
            return (
                Array.isArray(value.columns) &&
                value.columns.every(
                    (column) =>
                        isRecord(column) &&
                        typeof column.expr === 'string' &&
                        (column.alias === undefined || typeof column.alias === 'string'),
                )
            )
        case 'ORDER_BY':
            return (
                Array.isArray(value.columns) &&
                value.columns.every(
                    (column) =>
                        isRecord(column) &&
                        isNonEmptyString(column.name) &&
                        (column.direction === 'ASC' || column.direction === 'DESC'),
                ) &&
                (value.limit === null || (Number.isInteger(value.limit) && (value.limit as number) >= 0))
            )
        case 'GROUP_BY':
            return (
                Array.isArray(value.groupBy) &&
                value.groupBy.every((column) => typeof column === 'string') &&
                Array.isArray(value.aggregations) &&
                value.aggregations.every(
                    (aggregation) =>
                        isRecord(aggregation) &&
                        typeof aggregation.fn === 'string' &&
                        AGGREGATION_FUNCTIONS.has(aggregation.fn) &&
                        typeof aggregation.expr === 'string' &&
                        typeof aggregation.alias === 'string',
                )
            )
        case 'JOIN':
            return (
                typeof value.mode === 'string' &&
                JOIN_MODES.has(value.mode) &&
                typeof value.joinType === 'string' &&
                JOIN_TYPES.has(value.joinType) &&
                isNonEmptyString(value.table) &&
                typeof value.on === 'string' &&
                (value.alias === undefined || typeof value.alias === 'string') &&
                (value.subTable === undefined || typeof value.subTable === 'string') &&
                (value.subSteps === undefined ||
                    (Array.isArray(value.subSteps) && value.subSteps.every(isPipelineStep)))
            )
        case 'RAW_SQL':
            return typeof value.sql === 'string'
    }
}

function isWorkspaceTab(value: unknown): value is 'browse' | 'query' | 'edit' {
    return typeof value === 'string' && WORKSPACE_TABS.has(value)
}

function isStringRecord(value: unknown): value is Record<string, string> {
    return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

function isPort(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 65535
}
