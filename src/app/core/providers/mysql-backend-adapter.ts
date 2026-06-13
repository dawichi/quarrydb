import type { MysqlConnectionTarget } from '@quarrydb/shared/mysql-connection-target'
import type { MysqlConnectRequest } from './mysql-connect-request'

export interface MysqlConnectionSession {
    target: MysqlConnectionTarget
    source: MysqlConnectRequest['source']
    connectedAt: number
}

export interface MysqlSchemaSummary {
    name: string
    isDefault: boolean
}

export interface MysqlTableSummary {
    schemaName: string
    name: string
}

export interface MysqlQueryResult {
    kind: 'rows' | 'command'
    rows: Record<string, unknown>[]
    columns: string[]
    affectedRows?: number
    lastInsertId?: number
}

export interface MysqlBackendAdapter {
    connect(request: MysqlConnectRequest): Promise<MysqlConnectionSession>
    listSchemas(session: MysqlConnectionSession): Promise<MysqlSchemaSummary[]>
    listTables(session: MysqlConnectionSession, schemaName: string): Promise<MysqlTableSummary[]>
    queryTableRows(
        session: MysqlConnectionSession,
        schemaName: string,
        tableName: string,
        limit: number,
        offset: number,
    ): Promise<{ rows: Record<string, unknown>[]; columns: string[]; total: number }>
    runQuery(session: MysqlConnectionSession, sql: string, previewLimit: number): Promise<MysqlQueryResult>
}
