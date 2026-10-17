import { Injectable } from '@angular/core'
import type { Column } from '@quarrydb/shared'
import { quoteIdentifier } from '@quarrydb/shared/sql-identifiers'
import { connectSql, type SqlClient, type SqlStatement, toRecords } from '../native/sql-client'
import { describeSafeError } from '../services/safe-error'
import type { EditOperation } from '../store/edit.store'
import type {
    MysqlBackendAdapter,
    MysqlConnectionSession,
    MysqlQueryResult,
    MysqlSchemaSummary,
    MysqlTableBrowseOptions,
    MysqlTableSummary,
} from './mysql-backend-adapter'
import type { MysqlConnectRequest } from './mysql-connect-request'
import { MysqlSampleDataService } from './mysql-sample-data.service'

const MAX_MYSQL_PREVIEW_ROWS = 500
const MAX_MYSQL_METADATA_TABLES_PER_QUERY = 200

interface MysqlColumnMetadataRow {
    table_name?: string
    column_name: string
    column_type: string
    is_nullable: 'YES' | 'NO'
    column_key: 'PRI' | 'UNI' | 'MUL' | ''
    column_default: string | null
}

@Injectable({ providedIn: 'root' })
export class MysqlBackendAdapterService implements MysqlBackendAdapter {
    private readonly clients = new Map<string, SqlClient>()
    private readonly sampleData = new MysqlSampleDataService()

    forgetConnection(connectionId: string): void {
        const client = this.clients.get(connectionId)
        this.clients.delete(connectionId)
        void client?.close().catch(() => undefined)
    }

    async connect(request: MysqlConnectRequest): Promise<MysqlConnectionSession> {
        this.validateTarget(request)
        const client = await this.openClient(request)
        // A trivial round trip, so bad credentials fail here and not on the first browse.
        await client.select('SELECT 1 AS ok')
        this.clients.set(request.target.connectionId, client)
        return {
            target: request.target,
            source: request.source,
            connectedAt: Date.now(),
        }
    }

    async listSchemas(session: MysqlConnectionSession): Promise<MysqlSchemaSummary[]> {
        const db = this.client(session)
        const rows = await db.select<Array<{ name: string }>>(
            'SELECT schema_name AS name FROM information_schema.schemata ORDER BY schema_name',
        )
        const defaultSchema = session.target.defaultDatabase
        return rows
            .map((row) => row.name)
            .filter((name): name is string => typeof name === 'string' && name.length > 0)
            .map((name) => ({ name, isDefault: defaultSchema ? name === defaultSchema : false }))
    }

    async listTables(session: MysqlConnectionSession, schemaName: string): Promise<MysqlTableSummary[]> {
        const db = this.client(session)
        try {
            const rows = await db.select<Array<{ table_name: string }>>(
                `SELECT table_name AS table_name
                 FROM information_schema.tables
                 WHERE table_schema = ?
                   AND table_type = 'BASE TABLE'
                 ORDER BY table_name`,
                [schemaName],
            )
            const tableNames = rows.map((row) => row.table_name).filter((name) => typeof name === 'string')
            if (tableNames.length === 0) return []

            const columnsByTable = await this.listColumnsForTables(db, schemaName, tableNames)
            return tableNames
                .map((tableName) => ({ schemaName, name: tableName, columns: columnsByTable.get(tableName) ?? [] }))
                .sort((left, right) => left.name.localeCompare(right.name))
        } catch (error) {
            throw new Error(`Failed to load tables from ${schemaName}: ${this.describeError(error)}`)
        }
    }

    async queryTableRows(
        session: MysqlConnectionSession,
        schemaName: string,
        tableName: string,
        limit: number,
        offset: number,
        options: MysqlTableBrowseOptions = {},
    ): Promise<{ rows: Record<string, unknown>[]; columns: string[]; total: number }> {
        const db = this.client(session)
        const source = `${this.quote(schemaName)}.${this.quote(tableName)}`
        const columns = await this.listColumns(db, schemaName, tableName)
        const filter = options.filter?.trim() ?? ''
        const filterClause = filter
            ? ` WHERE ${columns.map((column) => `CAST(${this.quote(column.name)} AS CHAR) LIKE ?`).join(' OR ')}`
            : ''
        const filterValues = filter ? columns.map(() => `%${filter}%`) : []
        const sortColumn = columns.find((column) => column.name === options.sortColumn)?.name
        const orderClause = sortColumn
            ? ` ORDER BY ${this.quote(sortColumn)} ${options.sortDirection === 'desc' ? 'DESC' : 'ASC'}`
            : ''
        const [countRows, result] = await Promise.all([
            db.select<Array<{ count: number }>>(`SELECT COUNT(*) AS count FROM ${source}${filterClause}`, filterValues),
            db.select(
                `SELECT * FROM ${source}${filterClause}${orderClause} LIMIT ${this.toSafePreviewLimit(limit)} OFFSET ${this.toSafeNonNegativeInt(offset)}`,
                filterValues,
            ),
        ])
        return {
            rows: result,
            columns: columns.map((column) => column.name),
            total: Number(countRows[0]?.count ?? 0),
        }
    }

    async fetchTableRows(
        session: MysqlConnectionSession,
        schemaName: string,
        tableName: string,
    ): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
        const result = await this.client(session).query(
            `SELECT * FROM ${this.quote(schemaName)}.${this.quote(tableName)}`,
        )
        return { rows: toRecords(result), columns: result.columns }
    }

    async runQuery(session: MysqlConnectionSession, sql: string, previewLimit: number): Promise<MysqlQueryResult> {
        const db = this.client(session)
        const normalizedSql = this.normalizeSql(sql)
        if (this.isRowQuery(normalizedSql)) {
            // The native layer stops reading after the cap, so the query runs unmodified and
            // keeps its own ORDER BY / LIMIT semantics.
            const result = await db.query(normalizedSql, [], this.toSafePreviewLimit(previewLimit))
            return { kind: 'rows', rows: toRecords(result), columns: result.columns }
        }

        const result = await db.execute(normalizedSql)
        return {
            kind: 'command',
            rows: [],
            columns: [],
            affectedRows: result.rowsAffected,
            lastInsertId: result.lastInsertId ?? undefined,
        }
    }

    async runQueryFull(session: MysqlConnectionSession, sql: string): Promise<Record<string, unknown>[]> {
        const normalizedSql = this.normalizeSql(sql)
        if (!this.isRowQuery(normalizedSql)) {
            throw new Error('Only result-returning queries can be exported')
        }
        return this.client(session).select(normalizedSql)
    }

    /** Applies staged edits atomically; a vanished update/delete target rolls everything back. */
    async applyEdits(
        session: MysqlConnectionSession,
        schemaName: string,
        tableName: string,
        operations: EditOperation[],
    ): Promise<void> {
        const source = `${this.quote(schemaName)}.${this.quote(tableName)}`
        const statements: SqlStatement[] = []
        for (const operation of operations) {
            if (operation.kind === 'update') {
                const columns = Object.keys(operation.changes)
                const primaryKeys = Object.keys(operation.pkValues)
                if (columns.length === 0 || primaryKeys.length === 0) continue
                const setClause = columns.map((column) => `${this.quote(column)} = ?`).join(', ')
                const whereClause = primaryKeys.map((column) => `${this.quote(column)} = ?`).join(' AND ')
                statements.push({
                    sql: `UPDATE ${source} SET ${setClause} WHERE ${whereClause}`,
                    params: [...Object.values(operation.changes), ...Object.values(operation.pkValues)],
                    expectRows: true,
                })
            } else if (operation.kind === 'delete') {
                const primaryKeys = Object.keys(operation.pkValues)
                if (primaryKeys.length === 0) continue
                const whereClause = primaryKeys.map((column) => `${this.quote(column)} = ?`).join(' AND ')
                statements.push({
                    sql: `DELETE FROM ${source} WHERE ${whereClause}`,
                    params: Object.values(operation.pkValues),
                    expectRows: true,
                })
            } else {
                const columns = Object.keys(operation.values)
                if (columns.length === 0) continue
                const placeholders = columns.map(() => '?').join(', ')
                statements.push({
                    sql: `INSERT INTO ${source} (${columns.map((column) => this.quote(column)).join(', ')}) VALUES (${placeholders})`,
                    params: Object.values(operation.values),
                })
            }
        }
        await this.client(session).batch(statements)
    }

    async seedSampleData(session: MysqlConnectionSession, schemaName: string): Promise<boolean> {
        return this.sampleData.seed(this.client(session), schemaName)
    }

    /** Seam for tests that talk to MySQL without the Tauri runtime. */
    protected openClient(request: MysqlConnectRequest): Promise<SqlClient> {
        return connectSql({
            engine: 'mysql',
            connectionId: request.target.connectionId,
            host: request.target.host.trim(),
            port: request.target.port,
            username: request.username,
            password: request.password,
            database: request.target.defaultDatabase,
            sslMode: request.sslMode ?? 'preferred',
        })
    }

    private client(session: MysqlConnectionSession): SqlClient {
        const client = this.clients.get(session.target.connectionId)
        if (!client) {
            throw new Error(`MySQL connection is not open for ${session.target.connectionName}`)
        }
        return client
    }

    private validateTarget(request: MysqlConnectRequest): void {
        const host = request.target.host.trim()
        if (!host || /[\s/?#@\\]/.test(host)) {
            throw new Error('MySQL host must be a non-empty hostname or IP address')
        }
        if (!Number.isInteger(request.target.port) || request.target.port < 1 || request.target.port > 65535) {
            throw new Error('MySQL port must be an integer between 1 and 65535')
        }
    }

    private async listColumns(db: SqlClient, schemaName: string, tableName: string): Promise<Column[]> {
        try {
            const rows = await db.select<MysqlColumnMetadataRow[]>(
                `SELECT column_name AS column_name,
                        column_type AS column_type,
                        is_nullable AS is_nullable,
                        column_key AS column_key,
                        column_default AS column_default
                 FROM information_schema.columns
                 WHERE table_schema = ?
                   AND table_name = ?
                 ORDER BY ordinal_position`,
                [schemaName, tableName],
            )
            return rows.map((row) => this.mapColumn(row))
        } catch (error) {
            throw new Error(`Failed to inspect columns for ${schemaName}.${tableName}: ${this.describeError(error)}`)
        }
    }

    private async listColumnsForTables(
        db: SqlClient,
        schemaName: string,
        tableNames: string[],
    ): Promise<Map<string, Column[]>> {
        const columnsByTable = new Map<string, Column[]>(tableNames.map((tableName) => [tableName, []]))
        try {
            for (let offset = 0; offset < tableNames.length; offset += MAX_MYSQL_METADATA_TABLES_PER_QUERY) {
                const tableBatch = tableNames.slice(offset, offset + MAX_MYSQL_METADATA_TABLES_PER_QUERY)
                const placeholders = tableBatch.map(() => '?').join(', ')
                const rows = await db.select<MysqlColumnMetadataRow[]>(
                    `SELECT table_name AS table_name,
                            column_name AS column_name,
                            column_type AS column_type,
                            is_nullable AS is_nullable,
                            column_key AS column_key,
                            column_default AS column_default
                     FROM information_schema.columns
                     WHERE table_schema = ?
                       AND table_name IN (${placeholders})
                     ORDER BY table_name, ordinal_position`,
                    [schemaName, ...tableBatch],
                )
                for (const row of rows) {
                    if (!row.table_name) continue
                    columnsByTable.get(row.table_name)?.push(this.mapColumn(row))
                }
            }
        } catch (error) {
            throw new Error(`Failed to inspect columns for ${schemaName}: ${this.describeError(error)}`)
        }
        return columnsByTable
    }

    private mapColumn(row: MysqlColumnMetadataRow): Column {
        return {
            name: row.column_name,
            type: row.column_type,
            nullable: row.is_nullable === 'YES',
            primaryKey: row.column_key === 'PRI',
            defaultValue: row.column_default === null || row.column_default === '' ? undefined : row.column_default,
        }
    }

    private isRowQuery(sql: string): boolean {
        return /^(select|show|describe|desc|explain|with|\()/i.test(sql)
    }

    private quote(identifier: string): string {
        return quoteIdentifier(identifier, 'mysql')
    }

    private describeError(error: unknown): string {
        return describeSafeError(error, 'Unknown MySQL adapter error')
    }

    private toSafeNonNegativeInt(value: number): number {
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
    }

    private toSafePreviewLimit(value: number): number {
        return Math.min(this.toSafeNonNegativeInt(value), MAX_MYSQL_PREVIEW_ROWS)
    }

    private normalizeSql(sql: string): string {
        const normalized = sql.trim().replace(/;+$/, '').trim()
        if (!normalized) throw new Error('SQL cannot be empty')
        return normalized
    }
}
