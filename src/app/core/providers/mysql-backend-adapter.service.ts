import { Injectable } from '@angular/core'
import Database from '@tauri-apps/plugin-sql'
import type {
    MysqlBackendAdapter,
    MysqlConnectionSession,
    MysqlQueryResult,
    MysqlSchemaSummary,
    MysqlTableSummary,
} from './mysql-backend-adapter'
import type { MysqlConnectRequest } from './mysql-connect-request'

@Injectable({ providedIn: 'root' })
export class MysqlBackendAdapterService implements MysqlBackendAdapter {
    private readonly requests = new Map<string, MysqlConnectRequest>()

    async connect(request: MysqlConnectRequest): Promise<MysqlConnectionSession> {
        const db = await Database.load(this.buildDsn(request))
        await db.close()
        this.requests.set(request.target.connectionId, request)
        return {
            target: request.target,
            source: request.source,
            connectedAt: Date.now(),
        }
    }

    async listSchemas(session: MysqlConnectionSession): Promise<MysqlSchemaSummary[]> {
        const db = await this.openDatabase(session)
        try {
            const rows = await db.select<Array<{ name: string }>>(
                'SELECT SCHEMA_NAME as name FROM information_schema.schemata ORDER BY SCHEMA_NAME',
            )
            const defaultSchema = session.target.defaultDatabase
            return rows.map((row) => ({
                name: row.name,
                isDefault: defaultSchema ? row.name === defaultSchema : false,
            }))
        } finally {
            await db.close()
        }
    }

    async listTables(session: MysqlConnectionSession, schemaName: string): Promise<MysqlTableSummary[]> {
        const db = await this.openDatabase(session)
        try {
            const rows = await db.select<Array<{ schemaName: string; name: string }>>(
                `SELECT TABLE_SCHEMA as schemaName, TABLE_NAME as name
                 FROM information_schema.tables
                 WHERE TABLE_SCHEMA = ?
                 AND TABLE_TYPE = 'BASE TABLE'
                 ORDER BY TABLE_NAME`,
                [schemaName],
            )
            return rows
        } finally {
            await db.close()
        }
    }

    async queryTableRows(
        session: MysqlConnectionSession,
        schemaName: string,
        tableName: string,
        limit: number,
        offset: number,
    ): Promise<{ rows: Record<string, unknown>[]; columns: string[]; total: number }> {
        const db = await this.openDatabase(session)
        const source = `${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(tableName)}`
        try {
            const [countRows, rows] = await Promise.all([
                db.select<Array<{ count: number }>>(`SELECT COUNT(*) as count FROM ${source}`),
                db.select<Record<string, unknown>[]>(`SELECT * FROM ${source} LIMIT ? OFFSET ?`, [limit, offset]),
            ])
            return {
                rows,
                columns: rows.length > 0 ? Object.keys(rows[0]) : [],
                total: countRows[0]?.count ?? 0,
            }
        } finally {
            await db.close()
        }
    }

    async runQuery(session: MysqlConnectionSession, sql: string, previewLimit: number): Promise<MysqlQueryResult> {
        const db = await this.openDatabase(session)
        const normalizedSql = sql.trim().replace(/;+$/, '')
        try {
            if (this.isRowQuery(normalizedSql)) {
                const querySql = /^(select|with)\b/i.test(normalizedSql)
                    ? `SELECT * FROM (${normalizedSql}) AS quarry_query LIMIT ${previewLimit}`
                    : normalizedSql
                const rows = await db.select<Record<string, unknown>[]>(querySql)
                return {
                    kind: 'rows',
                    rows,
                    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
                }
            }

            const result = await db.execute(normalizedSql)
            return {
                kind: 'command',
                rows: [],
                columns: [],
                affectedRows: result.rowsAffected,
                lastInsertId: result.lastInsertId ?? undefined,
            }
        } finally {
            await db.close()
        }
    }

    private buildDsn(request: MysqlConnectRequest): string {
        const username = encodeURIComponent(request.username)
        const password = encodeURIComponent(request.password)
        const host = request.target.host
        const port = request.target.port
        const database = request.target.defaultDatabase ? `/${encodeURIComponent(request.target.defaultDatabase)}` : ''
        return `mysql://${username}:${password}@${host}:${port}${database}`
    }

    private async openDatabase(session: MysqlConnectionSession) {
        const request = this.requests.get(session.target.connectionId)
        if (!request) {
            throw new Error(`MySQL connection request not found for ${session.target.connectionName}`)
        }
        return Database.load(this.buildDsn(request))
    }

    private isRowQuery(sql: string): boolean {
        return /^(select|show|describe|desc|explain|with)\b/i.test(sql)
    }

    private quoteIdentifier(identifier: string): string {
        return `\`${identifier.replaceAll('`', '``')}\``
    }
}
