import type { Column } from '@quarrydb/shared'
import type { MysqlConnectionTarget } from '@quarrydb/shared/mysql-connection-target'
import type { EditOperation } from '../store/edit.store'
import type { MysqlConnectRequest } from './mysql-connect-request'

export interface MysqlDatabaseClient {
    select<T>(query: string, bindValues?: unknown[]): Promise<T>
    execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected?: number; lastInsertId?: number }>
    close(): Promise<void>
}

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
    columns: Column[]
}

export interface MysqlQueryResult {
    kind: 'rows' | 'command'
    rows: Record<string, unknown>[]
    columns: string[]
    affectedRows?: number
    lastInsertId?: number
}

export interface MysqlTableBrowseOptions {
    filter?: string
    sortColumn?: string
    sortDirection?: 'asc' | 'desc'
}

export interface MysqlBackendAdapter {
    connect(request: MysqlConnectRequest): Promise<MysqlConnectionSession>
    listSchemas(session: MysqlConnectionSession): Promise<MysqlSchemaSummary[]>
    listTables(session: MysqlConnectionSession, schemaName: string): Promise<MysqlTableSummary[]>
    seedSampleData(session: MysqlConnectionSession, schemaName: string): Promise<boolean>
    queryTableRows(
        session: MysqlConnectionSession,
        schemaName: string,
        tableName: string,
        limit: number,
        offset: number,
        options?: MysqlTableBrowseOptions,
    ): Promise<{ rows: Record<string, unknown>[]; columns: string[]; total: number }>
    fetchTableRows(
        session: MysqlConnectionSession,
        schemaName: string,
        tableName: string,
    ): Promise<{
        rows: Record<string, unknown>[]
        columns: string[]
    }>
    runQuery(session: MysqlConnectionSession, sql: string, previewLimit: number): Promise<MysqlQueryResult>
    runQueryFull(session: MysqlConnectionSession, sql: string): Promise<Record<string, unknown>[]>
    applyEdits(
        session: MysqlConnectionSession,
        schemaName: string,
        tableName: string,
        operations: EditOperation[],
    ): Promise<void>
}
