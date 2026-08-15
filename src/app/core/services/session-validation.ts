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
    if (!isRecord(value) || value['version'] !== 1 || !isFiniteNumber(value['savedAt'])) return false

    switch (value['providerId']) {
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
    if (!isRecord(value) || value['version'] !== 1) return false
    const databases = value['databases']
    if (!Array.isArray(databases) || databases.length === 0) return false

    return (
        databases.every(isSqliteDatabase) &&
        isWorkspaceTab(value['activeTab']) &&
        (value['selectedTable'] === null || isSqliteSelection(value['selectedTable'])) &&
        isSqlitePipeline(value['pipeline'])
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

function isSqliteSession(value: unknown): value is SqlitePersistedSession {
    if (!isRecord(value) || value['providerId'] !== 'sqlite') return false
    const workspace = value['workspace']
    if (!isRecord(workspace)) return false
    const databases = workspace['databases']

    return (
        isNonEmptyString(workspace['name']) &&
        Array.isArray(databases) &&
        databases.length > 0 &&
        databases.every(isSqliteDatabase) &&
        (workspace['selectedTable'] === undefined ||
            workspace['selectedTable'] === null ||
            isSqliteSelection(workspace['selectedTable'])) &&
        (workspace['activeTab'] === undefined || isWorkspaceTab(workspace['activeTab'])) &&
        isSqlitePipeline(value['pipeline'])
    )
}

function isMysqlSession(value: unknown): value is MysqlPersistedSession {
    if (!isRecord(value) || !isMysqlTarget(value['workspace'])) return false
    const workspace = value['workspace']
    return (
        (workspace['selectedTable'] === undefined ||
            workspace['selectedTable'] === null ||
            isMysqlSelection(workspace['selectedTable'])) &&
        (workspace['activeTab'] === undefined || MYSQL_WORKSPACE_TABS.has(String(workspace['activeTab']))) &&
        isMysqlPipeline(value['pipeline'])
    )
}

function isRedisSession(value: unknown): value is RedisPersistedSession {
    if (!isRecord(value) || !isRedisTarget(value['workspace'])) return false
    const workspace = value['workspace']
    return (
        (workspace['selectedKey'] === undefined ||
            workspace['selectedKey'] === null ||
            typeof workspace['selectedKey'] === 'string') &&
        (workspace['keyPattern'] === undefined || typeof workspace['keyPattern'] === 'string') &&
        (workspace['activeTab'] === undefined || REDIS_WORKSPACE_TABS.has(String(workspace['activeTab'])))
    )
}

function isSqliteDatabase(value: unknown): value is { path: string; alias: string } {
    return isRecord(value) && isNonEmptyString(value['path']) && isNonEmptyString(value['alias'])
}

function isSqliteSelection(value: unknown): value is { schemaAlias: string; tableName: string } {
    return isRecord(value) && isNonEmptyString(value['schemaAlias']) && isNonEmptyString(value['tableName'])
}

function isMysqlSelection(value: unknown): value is { schemaName: string; tableName: string } {
    return isRecord(value) && isNonEmptyString(value['schemaName']) && isNonEmptyString(value['tableName'])
}

function isMysqlTarget(value: unknown): value is MysqlWorkspaceSessionState {
    return (
        isRecord(value) &&
        isNonEmptyString(value['connectionId']) &&
        isNonEmptyString(value['connectionName']) &&
        isNonEmptyString(value['host']) &&
        isPort(value['port']) &&
        (value['defaultDatabase'] === undefined || typeof value['defaultDatabase'] === 'string')
    )
}

function isRedisTarget(value: unknown): value is RedisWorkspaceSessionState {
    return (
        isRecord(value) &&
        isNonEmptyString(value['connectionId']) &&
        isNonEmptyString(value['connectionName']) &&
        isNonEmptyString(value['host']) &&
        isPort(value['port']) &&
        isDatabaseIndex(value['database']) &&
        typeof value['tls'] === 'boolean' &&
        (value['username'] === undefined || typeof value['username'] === 'string')
    )
}

function isSqlitePipeline(value: unknown): boolean {
    if (!isRecord(value) || !Array.isArray(value['steps']) || !value['steps'].every(isPipelineStep)) return false
    if (!isStringRecord(value['variableValues'])) return false
    return value['source'] === null || value['source'] === undefined || isPipelineSource(value['source'], 'sqlite')
}

function isMysqlPipeline(value: unknown): boolean {
    if (!isRecord(value) || !Array.isArray(value['steps']) || !value['steps'].every(isPipelineStep)) return false
    if (!isStringRecord(value['variableValues'])) return false
    return value['source'] === null || value['source'] === undefined || isPipelineSource(value['source'], 'mysql')
}

function isPipelineSource(value: unknown, provider: 'sqlite' | 'mysql'): boolean {
    if (!isRecord(value) || !isNonEmptyString(value['tableName']) || !Array.isArray(value['columns'])) return false
    if (!value['columns'].every((column) => typeof column === 'string')) return false
    return provider === 'sqlite'
        ? isNonEmptyString(value['path']) && isNonEmptyString(value['alias'])
        : isNonEmptyString(value['connectionId']) && isNonEmptyString(value['schemaName'])
}

function isPipelineStep(value: unknown): value is PipelineStep {
    if (!isRecord(value)) return false
    const type = value['type']
    if (!isNonEmptyString(value['id']) || typeof type !== 'string' || !STEP_TYPES.has(type)) return false

    switch (type) {
        case 'WHERE':
            return typeof value['expression'] === 'string'
        case 'SELECT':
            return (
                Array.isArray(value['columns']) &&
                value['columns'].every(
                    (column) =>
                        isRecord(column) &&
                        typeof column['expr'] === 'string' &&
                        (column['alias'] === undefined || typeof column['alias'] === 'string'),
                )
            )
        case 'ORDER_BY':
            return (
                Array.isArray(value['columns']) &&
                value['columns'].every(
                    (column) =>
                        isRecord(column) &&
                        isNonEmptyString(column['name']) &&
                        (column['direction'] === 'ASC' || column['direction'] === 'DESC'),
                ) &&
                isNullableNonNegativeInteger(value['limit'])
            )
        case 'GROUP_BY':
            return (
                Array.isArray(value['groupBy']) &&
                value['groupBy'].every((column) => typeof column === 'string') &&
                Array.isArray(value['aggregations']) &&
                value['aggregations'].every(
                    (aggregation) =>
                        isRecord(aggregation) &&
                        typeof aggregation['fn'] === 'string' &&
                        AGGREGATION_FUNCTIONS.has(aggregation['fn']) &&
                        typeof aggregation['expr'] === 'string' &&
                        typeof aggregation['alias'] === 'string',
                )
            )
        case 'JOIN':
            return (
                typeof value['mode'] === 'string' &&
                JOIN_MODES.has(value['mode']) &&
                typeof value['joinType'] === 'string' &&
                JOIN_TYPES.has(value['joinType']) &&
                isNonEmptyString(value['table']) &&
                typeof value['on'] === 'string' &&
                (value['alias'] === undefined || typeof value['alias'] === 'string') &&
                (value['subTable'] === undefined || typeof value['subTable'] === 'string') &&
                (value['subSteps'] === undefined ||
                    (Array.isArray(value['subSteps']) && value['subSteps'].every(isPipelineStep)))
            )
        case 'RAW_SQL':
            return typeof value['sql'] === 'string'
        default:
            return false
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
    return Number.isInteger(value) && typeof value === 'number' && value >= 1 && value <= 65535
}

function isDatabaseIndex(value: unknown): value is number {
    return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 255
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
    return value === null || (Number.isInteger(value) && typeof value === 'number' && value >= 0)
}
