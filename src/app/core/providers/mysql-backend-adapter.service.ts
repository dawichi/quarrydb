import { Injectable } from '@angular/core'
import type { Column } from '@quarrydb/shared'
import { quoteIdentifier } from '@quarrydb/shared/sql-identifiers'
import Database from '@tauri-apps/plugin-sql'
import { describeSafeError } from '../services/safe-error'
import type {
    MysqlBackendAdapter,
    MysqlConnectionSession,
    MysqlDatabaseClient,
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
    column_default: string
}

@Injectable({ providedIn: 'root' })
export class MysqlBackendAdapterService implements MysqlBackendAdapter {
    private readonly requests = new Map<string, MysqlConnectRequest>()
    private readonly sampleData = new MysqlSampleDataService()

    forgetConnection(connectionId: string): void {
        this.requests.delete(connectionId)
    }

    async connect(request: MysqlConnectRequest): Promise<MysqlConnectionSession> {
        const db = await this.loadDatabase(this.buildDsn(request))
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
            const rows = await db.select<Array<Record<string, unknown>>>('SHOW DATABASES')
            const defaultSchema = session.target.defaultDatabase
            return rows
                .map((row) => this.extractFirstStringValue(row))
                .filter((name): name is string => !!name)
                .sort((left, right) => left.localeCompare(right))
                .map((name) => ({
                    name,
                    isDefault: defaultSchema ? name === defaultSchema : false,
                }))
        } finally {
            await db.close()
        }
    }

    async listTables(session: MysqlConnectionSession, schemaName: string): Promise<MysqlTableSummary[]> {
        const db = await this.openDatabase(session)
        try {
            const rows = await db.select<Array<Record<string, unknown>>>(
                `SELECT CAST(table_name AS CHAR(255)) AS table_name
                 FROM information_schema.tables
                 WHERE table_schema = ?
                   AND table_type = 'BASE TABLE'
                 ORDER BY table_name`,
                [schemaName],
            )

            if (rows.length === 0) {
                return []
            }

            const tableNames = rows.map((row) => this.extractTableName(row)).filter((name): name is string => !!name)
            if (tableNames.length === 0) {
                return []
            }

            const columnsByTable = await this.listColumnsForTables(db, schemaName, tableNames)
            const tablesWithColumns = tableNames.map((tableName) => ({
                schemaName,
                name: tableName,
                columns: columnsByTable.get(tableName) ?? [],
            }))

            return tablesWithColumns.sort((left, right) => left.name.localeCompare(right.name))
        } catch (error) {
            throw new Error(`Failed to load tables from ${schemaName}: ${this.describeError(error)}`)
        } finally {
            await db.close()
        }
    }

    private async listColumns(db: MysqlDatabaseClient, schemaName: string, tableName: string): Promise<Column[]> {
        let rows: MysqlColumnMetadataRow[]

        try {
            rows = await db.select<MysqlColumnMetadataRow[]>(
                `SELECT CAST(column_name AS CHAR(255)) AS column_name,
                        CAST(column_type AS CHAR(255)) AS column_type,
                        CAST(is_nullable AS CHAR(3)) AS is_nullable,
                        CAST(column_key AS CHAR(3)) AS column_key,
                        CAST(COALESCE(column_default, '') AS CHAR(255)) AS column_default
                 FROM information_schema.columns
                 WHERE table_schema = ?
                   AND table_name = ?
                 ORDER BY ordinal_position`,
                [schemaName, tableName],
            )
        } catch (error) {
            throw new Error(`Failed to inspect columns for ${schemaName}.${tableName}: ${this.describeError(error)}`)
        }

        return rows.map((row) => this.mapColumn(row))
    }

    private async listColumnsForTables(
        db: MysqlDatabaseClient,
        schemaName: string,
        tableNames: string[],
    ): Promise<Map<string, Column[]>> {
        const columnsByTable = new Map<string, Column[]>(tableNames.map((tableName) => [tableName, []]))

        try {
            for (let offset = 0; offset < tableNames.length; offset += MAX_MYSQL_METADATA_TABLES_PER_QUERY) {
                const tableBatch = tableNames.slice(offset, offset + MAX_MYSQL_METADATA_TABLES_PER_QUERY)
                const placeholders = tableBatch.map(() => '?').join(', ')
                const rows = await db.select<MysqlColumnMetadataRow[]>(
                    `SELECT CAST(table_name AS CHAR(255)) AS table_name,
                            CAST(column_name AS CHAR(255)) AS column_name,
                            CAST(column_type AS CHAR(255)) AS column_type,
                            CAST(is_nullable AS CHAR(3)) AS is_nullable,
                            CAST(column_key AS CHAR(3)) AS column_key,
                            CAST(COALESCE(column_default, '') AS CHAR(255)) AS column_default
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
            defaultValue: row.column_default === '' ? undefined : row.column_default,
        }
    }

    private extractFirstStringValue(row: Record<string, unknown>): string | null {
        for (const value of Object.values(row)) {
            if (typeof value === 'string') {
                return value
            }
        }
        return null
    }

    private extractTableName(row: Record<string, unknown>): string | null {
        const value = row['table_name']
        return typeof value === 'string' ? value : null
    }

    async queryTableRows(
        session: MysqlConnectionSession,
        schemaName: string,
        tableName: string,
        limit: number,
        offset: number,
        options: MysqlTableBrowseOptions = {},
    ): Promise<{ rows: Record<string, unknown>[]; columns: string[]; total: number }> {
        const db = await this.openDatabase(session)
        const source = `${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(tableName)}`
        const safeLimit = this.toSafePreviewLimit(limit)
        const safeOffset = this.toSafeNonNegativeInt(offset)
        try {
            const columns = await this.listColumns(db, schemaName, tableName)
            const selectList = this.buildPreviewSelectList(columns)
            const filter = options.filter?.trim() ?? ''
            const filterClause = filter
                ? ` WHERE ${columns.map((column) => `CAST(${this.quoteIdentifier(column.name)} AS CHAR) LIKE ?`).join(' OR ')}`
                : ''
            const filterValues = filter ? columns.map(() => `%${filter}%`) : []
            const sortColumn = columns.find((column) => column.name === options.sortColumn)?.name
            const orderClause = sortColumn
                ? ` ORDER BY ${this.quoteIdentifier(sortColumn)} ${options.sortDirection === 'desc' ? 'DESC' : 'ASC'}`
                : ''
            const countSql = `SELECT COUNT(*) as count FROM ${source}${filterClause}`
            const rowsSql = `SELECT ${selectList} FROM ${source}${filterClause}${orderClause} LIMIT ${safeLimit} OFFSET ${safeOffset}`
            const [countRows, rows] = await Promise.all([
                filterValues.length
                    ? db.select<Array<{ count: number }>>(countSql, filterValues)
                    : db.select<Array<{ count: number }>>(countSql),
                filterValues.length
                    ? db.select<Record<string, unknown>[]>(rowsSql, filterValues)
                    : db.select<Record<string, unknown>[]>(rowsSql),
            ])
            return {
                rows,
                columns: columns.map((column) => column.name),
                total: countRows[0]?.count ?? 0,
            }
        } finally {
            await db.close()
        }
    }

    async fetchTableRows(
        session: MysqlConnectionSession,
        schemaName: string,
        tableName: string,
    ): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
        const db = await this.openDatabase(session)
        const source = `${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(tableName)}`
        try {
            const columns = await this.listColumns(db, schemaName, tableName)
            const rows = await db.select<Record<string, unknown>[]>(
                `SELECT ${this.buildPreviewSelectList(columns)} FROM ${source}`,
            )
            return { rows, columns: columns.map((column) => column.name) }
        } finally {
            await db.close()
        }
    }

    async runQuery(session: MysqlConnectionSession, sql: string, previewLimit: number): Promise<MysqlQueryResult> {
        const db = await this.openDatabase(session)
        const normalizedSql = this.normalizeSql(sql)
        const safePreviewLimit = this.toSafePreviewLimit(previewLimit)
        try {
            if (this.isRowQuery(normalizedSql)) {
                const rewrittenSql = await this.rewriteSimpleSelectForPreview(db, normalizedSql)
                const querySql = this.shouldWrapRowQuery(rewrittenSql)
                    ? `SELECT * FROM (${rewrittenSql}) AS quarry_query LIMIT ${safePreviewLimit}`
                    : rewrittenSql
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

    async runQueryFull(session: MysqlConnectionSession, sql: string): Promise<Record<string, unknown>[]> {
        const db = await this.openDatabase(session)
        const normalizedSql = this.normalizeSql(sql)
        try {
            if (!this.isRowQuery(normalizedSql)) {
                throw new Error('Only result-returning queries can be exported')
            }
            return await db.select<Record<string, unknown>[]>(normalizedSql)
        } finally {
            await db.close()
        }
    }

    async applyEdits(
        session: MysqlConnectionSession,
        schemaName: string,
        tableName: string,
        operations: import('../store/edit.store').EditOperation[],
    ): Promise<void> {
        const db = await this.openDatabase(session)
        const source = `${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(tableName)}`
        try {
            await db.execute('BEGIN')
            try {
                for (const operation of operations) {
                    if (operation.kind === 'update') {
                        const columns = Object.keys(operation.changes)
                        const primaryKeys = Object.keys(operation.pkValues)
                        if (columns.length === 0 || primaryKeys.length === 0) continue
                        const setClause = columns.map((column) => `${this.quoteIdentifier(column)} = ?`).join(', ')
                        const whereClause = primaryKeys
                            .map((column) => `${this.quoteIdentifier(column)} = ?`)
                            .join(' AND ')
                        const result = await db.execute(`UPDATE ${source} SET ${setClause} WHERE ${whereClause}`, [
                            ...Object.values(operation.changes),
                            ...Object.values(operation.pkValues),
                        ])
                        this.assertEditTargetAffected(result.rowsAffected, 'update')
                    } else if (operation.kind === 'delete') {
                        const primaryKeys = Object.keys(operation.pkValues)
                        if (primaryKeys.length === 0) continue
                        const whereClause = primaryKeys
                            .map((column) => `${this.quoteIdentifier(column)} = ?`)
                            .join(' AND ')
                        const result = await db.execute(
                            `DELETE FROM ${source} WHERE ${whereClause}`,
                            Object.values(operation.pkValues),
                        )
                        this.assertEditTargetAffected(result.rowsAffected, 'delete')
                    } else {
                        const columns = Object.keys(operation.values)
                        if (columns.length === 0) continue
                        const columnList = columns.map((column) => this.quoteIdentifier(column)).join(', ')
                        const placeholders = columns.map(() => '?').join(', ')
                        await db.execute(
                            `INSERT INTO ${source} (${columnList}) VALUES (${placeholders})`,
                            Object.values(operation.values),
                        )
                    }
                }
                await db.execute('COMMIT')
            } catch (error) {
                await db.execute('ROLLBACK')
                throw error
            }
        } finally {
            await db.close()
        }
    }

    async seedSampleData(session: MysqlConnectionSession, schemaName: string): Promise<boolean> {
        const db = await this.openDatabase(session)
        try {
            return await this.sampleData.seed(db, schemaName)
        } finally {
            await db.close()
        }
    }

    private buildDsn(request: MysqlConnectRequest): string {
        const host = request.target.host.trim()
        if (!host || /[\s/?#@\\]/.test(host)) {
            throw new Error('MySQL host must be a non-empty hostname or IP address')
        }
        if (!Number.isInteger(request.target.port) || request.target.port < 1 || request.target.port > 65535) {
            throw new Error('MySQL port must be an integer between 1 and 65535')
        }
        const username = encodeURIComponent(request.username)
        const password = encodeURIComponent(request.password)
        const port = request.target.port
        const database = request.target.defaultDatabase ? `/${encodeURIComponent(request.target.defaultDatabase)}` : ''
        const sslMode = request.sslMode ?? 'preferred'
        const sslValue = sslMode === 'disabled' ? 'DISABLED' : sslMode === 'required' ? 'REQUIRED' : 'PREFERRED'
        return `mysql://${username}:${password}@${host}:${port}${database}?ssl-mode=${sslValue}`
    }

    protected async loadDatabase(dsn: string): Promise<MysqlDatabaseClient> {
        return (await Database.load(dsn)) as unknown as MysqlDatabaseClient
    }

    private async openDatabase(session: MysqlConnectionSession): Promise<MysqlDatabaseClient> {
        const request = this.requests.get(session.target.connectionId)
        if (!request) {
            throw new Error(`MySQL connection request not found for ${session.target.connectionName}`)
        }
        return this.loadDatabase(this.buildDsn(request))
    }

    private isRowQuery(sql: string): boolean {
        return /^(select|show|describe|desc|explain|with)\b/i.test(sql)
    }

    private shouldWrapRowQuery(sql: string): boolean {
        if (/^with\b/i.test(sql)) {
            return true
        }

        if (!/^select\b/i.test(sql)) {
            return false
        }

        return /\bfrom\b/i.test(sql)
    }

    private quoteIdentifier(identifier: string): string {
        return quoteIdentifier(identifier, 'mysql')
    }

    private buildPreviewSelectList(columns: Column[]): string {
        return columns
            .map((column) => {
                const identifier = this.quoteIdentifier(column.name)
                const expression = this.shouldCastColumnForPreview(column.type)
                    ? `CAST(${identifier} AS CHAR(255))`
                    : identifier
                return `${expression} AS ${identifier}`
            })
            .join(', ')
    }

    private async rewriteSimpleSelectForPreview(db: MysqlDatabaseClient, sql: string): Promise<string> {
        const match = sql.match(
            /^select\s+([\s\S]+?)\s+from\s+((?:`[^`]+`\.)?`[^`]+`)(?:\s+(?:as\s+)?([a-zA-Z_][\w]*|`[^`]+`))?(\s+.*)?$/i,
        )
        if (!match) {
            return sql
        }

        const [, projection, source, aliasToken, rest = ''] = match
        const reservedAliasKeywords = new Set(['where', 'order', 'group', 'having', 'limit', 'offset'])
        const normalizedAliasToken = aliasToken ? this.unquoteIdentifier(aliasToken).toLowerCase() : null
        const hasRealAlias = !!normalizedAliasToken && !reservedAliasKeywords.has(normalizedAliasToken)
        const effectiveAliasToken = hasRealAlias ? aliasToken : null
        const effectiveRest =
            aliasToken && !hasRealAlias ? `${rest ? ` ${aliasToken}${rest}` : ` ${aliasToken}`}` : rest
        if (/\b(join|union|intersect|except)\b/i.test(effectiveRest)) {
            return sql
        }

        const { schemaName, tableName } = this.parseQuotedTableReference(source)
        if (!tableName) {
            return sql
        }

        const columns = await this.listColumns(db, schemaName, tableName)
        const alias = effectiveAliasToken ? this.unquoteIdentifier(effectiveAliasToken) : null
        const rewrittenProjection = this.rewriteSimpleProjection(projection, columns, alias)
        if (!rewrittenProjection) {
            return sql
        }

        return `SELECT ${rewrittenProjection} FROM ${source}${effectiveAliasToken ? ` ${effectiveAliasToken}` : ''}${effectiveRest}`
    }

    private rewriteSimpleProjection(projection: string, columns: Column[], alias: string | null): string | null {
        const trimmedProjection = projection.trim()
        const sourceStarPatterns = new Set(['*'])
        if (alias) {
            sourceStarPatterns.add(`${alias}.*`)
            sourceStarPatterns.add(`${this.quoteIdentifier(alias)}.*`)
        }

        if (sourceStarPatterns.has(trimmedProjection)) {
            return columns.map((column) => this.buildProjectedColumnExpression(column, alias)).join(', ')
        }

        const expressions = this.splitTopLevelCsv(trimmedProjection)
        const rewrittenExpressions: string[] = []

        for (const expression of expressions) {
            const rewrittenExpression = this.rewriteProjectedExpression(expression, columns, alias)
            if (!rewrittenExpression) {
                return null
            }
            rewrittenExpressions.push(rewrittenExpression)
        }

        return rewrittenExpressions.join(', ')
    }

    private rewriteProjectedExpression(expression: string, columns: Column[], alias: string | null): string | null {
        const trimmedExpression = expression.trim()
        const match = trimmedExpression.match(
            /^(?:(`[^`]+`|[a-zA-Z_][\w]*)\.)?(`[^`]+`|[a-zA-Z_][\w]*)(?:\s+(?:as\s+)?(`[^`]+`|[a-zA-Z_][\w]*))?$/i,
        )
        if (!match) {
            return null
        }

        const [, qualifierToken, columnToken, aliasToken] = match
        const qualifier = qualifierToken ? this.unquoteIdentifier(qualifierToken) : null
        if (qualifier && alias && qualifier !== alias) {
            return null
        }

        const columnName = this.unquoteIdentifier(columnToken)
        const column = columns.find((candidate) => candidate.name === columnName)
        if (!column) {
            return null
        }

        const outputAlias = aliasToken ? this.unquoteIdentifier(aliasToken) : column.name
        const reference =
            qualifierToken && alias
                ? `${this.quoteIdentifier(alias)}.${this.quoteIdentifier(column.name)}`
                : this.quoteIdentifier(column.name)
        const projectionExpression = this.shouldCastColumnForPreview(column.type)
            ? `CAST(${reference} AS CHAR(255))`
            : reference

        return `${projectionExpression} AS ${this.quoteIdentifier(outputAlias)}`
    }

    private buildProjectedColumnExpression(column: Column, alias: string | null): string {
        const reference = alias
            ? `${this.quoteIdentifier(alias)}.${this.quoteIdentifier(column.name)}`
            : this.quoteIdentifier(column.name)
        const expression = this.shouldCastColumnForPreview(column.type) ? `CAST(${reference} AS CHAR(255))` : reference
        return `${expression} AS ${this.quoteIdentifier(column.name)}`
    }

    private splitTopLevelCsv(value: string): string[] {
        const parts: string[] = []
        let current = ''
        let depth = 0

        for (const character of value) {
            if (character === '(') {
                depth += 1
            } else if (character === ')' && depth > 0) {
                depth -= 1
            }

            if (character === ',' && depth === 0) {
                parts.push(current.trim())
                current = ''
                continue
            }

            current += character
        }

        if (current.trim()) {
            parts.push(current.trim())
        }

        return parts
    }

    private parseQuotedTableReference(reference: string): { schemaName: string; tableName: string | null } {
        const parts = reference.match(/`([^`]+)`/g)?.map((part) => this.unquoteIdentifier(part)) ?? []
        if (parts.length === 1) {
            return { schemaName: '', tableName: parts[0] }
        }

        if (parts.length >= 2) {
            return { schemaName: parts[0], tableName: parts[1] }
        }

        return { schemaName: '', tableName: null }
    }

    private unquoteIdentifier(identifier: string): string {
        return identifier.startsWith('`') && identifier.endsWith('`')
            ? identifier.slice(1, -1).replaceAll('``', '`')
            : identifier
    }

    private shouldCastColumnForPreview(type: string): boolean {
        return /^(decimal|numeric|fixed|dec|bit|binary|varbinary|blob|tinyblob|mediumblob|longblob|json)\b/i.test(type)
    }

    private describeError(error: unknown): string {
        return describeSafeError(error, 'Unknown MySQL adapter error')
    }

    private toSafeNonNegativeInt(value: number): number {
        if (!Number.isFinite(value) || value < 0) {
            return 0
        }

        return Math.floor(value)
    }

    private toSafePreviewLimit(value: number): number {
        return Math.min(this.toSafeNonNegativeInt(value), MAX_MYSQL_PREVIEW_ROWS)
    }

    private assertEditTargetAffected(rowsAffected: number | undefined, operation: 'update' | 'delete'): void {
        if (rowsAffected === 0) {
            throw new Error(`MySQL ${operation} target was not found; it may have changed remotely. Refresh and retry.`)
        }
    }

    private normalizeSql(sql: string): string {
        const normalized = sql.trim().replace(/;+$/, '').trim()
        if (!normalized) throw new Error('SQL cannot be empty')
        return normalized
    }
}
