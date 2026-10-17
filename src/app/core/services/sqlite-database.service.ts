import { Injectable } from '@angular/core'
import type { DatabaseSchema, TableSchema, TriggerSchema, ViewSchema } from '@quarrydb/shared'
import { quoteIdentifier, quoteQualifiedIdentifier } from '@quarrydb/shared/sql-identifiers'
import { open } from '@tauri-apps/plugin-dialog'
import { connectSql, type SqlClient, type SqlStatement, toRecords, uniqueColumnNames } from '../native/sql-client'
import type { EditOperation } from '../store/edit.store'

const MAX_SQLITE_PREVIEW_ROWS = 500

interface PragmaColumnRow {
    cid: number
    name: string
    type: string
    notnull: number
    dflt_value: string | null
    pk: number
}

interface PragmaFKRow {
    id: number
    seq: number
    table: string
    from: string
    to: string
    on_update: string
    on_delete: string
}

export interface CascadeNode {
    tableName: string
    rowCount: number
    depth: number
    parentTable: string
}

export interface TableImpact {
    rowCount: number
    cascadeNodes: CascadeNode[]
}

interface PragmaIndexRow {
    seq: number
    name: string
    unique: number
    origin: string
}

interface PragmaIndexInfoRow {
    seqno: number
    cid: number
    name: string
}

interface SqliteMasterRow {
    name: string
    tbl_name: string
    sql: string | null
}

@Injectable({ providedIn: 'root' })
export class SqliteDatabaseService {
    async pickFile(): Promise<string | null> {
        const result = await open({
            multiple: false,
            filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] }],
        })
        return result as string | null
    }

    async executeQuery(
        path: string,
        sql: string,
        previewLimit: number,
    ): Promise<{ rows: Record<string, unknown>[]; columns: string[]; total: number }> {
        const db = await this.open(path)
        const normalizedSql = this.normalizeSql(sql)
        const safeLimit = this.toSafePreviewLimit(previewLimit)
        const [countResult, rows] = await Promise.all([
            db.select<[{ count: number }]>(`SELECT COUNT(*) AS count FROM (${normalizedSql}) AS quarry_count`),
            db.select<Record<string, unknown>[]>(`SELECT * FROM (${normalizedSql}) AS quarry_preview LIMIT ?`, [
                safeLimit,
            ]),
        ])
        const columns = rows.length > 0 ? Object.keys(rows[0]) : []
        return { rows, columns, total: countResult[0]?.count ?? 0 }
    }

    /** Runs a compiled pipeline query; the native layer stops reading at `maxRows`. */
    async runBound(
        path: string,
        sql: string,
        params: unknown[],
        maxRows?: number,
    ): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
        const db = await this.open(path)
        const result = await db.query(sql, params, maxRows)
        return { rows: toRecords(result), columns: uniqueColumnNames(result.columns) }
    }

    async countBound(path: string, sql: string, params: unknown[]): Promise<number> {
        const db = await this.open(path)
        const [row] = await db.select<Array<{ count: number }>>(sql, params)
        return Number(row?.count ?? 0)
    }

    async queryRows(
        path: string,
        tableName: string,
        limit: number,
        offset: number,
        sortCol?: string,
        sortDir?: 'ASC' | 'DESC',
        filter?: { col: string; value: unknown },
    ): Promise<{ rows: Record<string, unknown>[]; total: number }> {
        const db = await this.open(path)
        const source = quoteQualifiedIdentifier(tableName, 'sqlite')
        const where = filter ? ` WHERE ${quoteIdentifier(filter.col, 'sqlite')} = ?` : ''
        const orderBy = sortCol
            ? ` ORDER BY ${quoteIdentifier(sortCol, 'sqlite')} ${sortDir === 'DESC' ? 'DESC' : 'ASC'}`
            : ''
        const filterArgs = filter ? [filter.value] : []
        const safeLimit = this.toSafePreviewLimit(limit)
        const safeOffset = this.toSafeNonNegativeInt(offset)
        const [countResult, rows] = await Promise.all([
            db.select<[{ count: number }]>(`SELECT COUNT(*) AS count FROM ${source}${where}`, filterArgs),
            db.select<Record<string, unknown>[]>(`SELECT * FROM ${source}${where}${orderBy} LIMIT ? OFFSET ?`, [
                ...filterArgs,
                safeLimit,
                safeOffset,
            ]),
        ])
        return { rows, total: countResult[0]?.count ?? 0 }
    }

    async fetchAllRows(
        path: string,
        tableName: string,
        sortCol?: string,
        sortDir?: 'ASC' | 'DESC',
    ): Promise<Record<string, unknown>[]> {
        const db = await this.open(path)
        const orderBy = sortCol
            ? ` ORDER BY ${quoteIdentifier(sortCol, 'sqlite')} ${sortDir === 'DESC' ? 'DESC' : 'ASC'}`
            : ''
        return await db.select<Record<string, unknown>[]>(
            `SELECT * FROM ${quoteQualifiedIdentifier(tableName, 'sqlite')}${orderBy}`,
        )
    }

    async executeQueryFull(path: string, sql: string): Promise<Record<string, unknown>[]> {
        const db = await this.open(path)
        return await db.select<Record<string, unknown>[]>(this.normalizeSql(sql))
    }

    /** Applies staged edits atomically: every operation commits, or none does. */
    async applyEdits(path: string, tableName: string, ops: EditOperation[]): Promise<void> {
        const table = quoteQualifiedIdentifier(tableName, 'sqlite')
        const quote = (name: string) => quoteIdentifier(name, 'sqlite')
        const statements: SqlStatement[] = []
        for (const op of ops) {
            if (op.kind === 'update') {
                const cols = Object.keys(op.changes)
                const pks = Object.keys(op.pkValues)
                if (cols.length === 0 || pks.length === 0) continue
                const setClauses = cols.map((k) => `${quote(k)} = ?`).join(', ')
                const whereClauses = pks.map((k) => `${quote(k)} = ?`).join(' AND ')
                statements.push({
                    sql: `UPDATE ${table} SET ${setClauses} WHERE ${whereClauses}`,
                    params: [...Object.values(op.changes), ...Object.values(op.pkValues)],
                    expectRows: true,
                })
            } else if (op.kind === 'delete') {
                const pks = Object.keys(op.pkValues)
                if (pks.length === 0) continue
                const whereClauses = pks.map((k) => `${quote(k)} = ?`).join(' AND ')
                statements.push({
                    sql: `DELETE FROM ${table} WHERE ${whereClauses}`,
                    params: Object.values(op.pkValues),
                    expectRows: true,
                })
            } else if (op.kind === 'insert') {
                const cols = Object.keys(op.values)
                if (cols.length === 0) continue
                const placeholders = cols.map(() => '?').join(', ')
                statements.push({
                    sql: `INSERT INTO ${table} (${cols.map(quote).join(', ')}) VALUES (${placeholders})`,
                    params: Object.values(op.values),
                })
            }
        }
        const db = await this.open(path)
        await db.batch(statements)
    }

    async getTableImpact(path: string, tableName: string, allTableNames: string[]): Promise<TableImpact> {
        const db = await this.open(path)
        const countResult = await db.select<[{ count: number }]>(
            `SELECT COUNT(*) AS count FROM ${quoteQualifiedIdentifier(tableName, 'sqlite')}`,
        )
        const rowCount = countResult[0]?.count ?? 0

        const fkMap = new Map<string, PragmaFKRow[]>()
        for (const t of allTableNames) {
            if (t === tableName) continue
            const fks = await db.select<PragmaFKRow[]>(`PRAGMA foreign_key_list(${quoteIdentifier(t, 'sqlite')})`)
            fkMap.set(t, fks)
        }

        const cascadeNodes: CascadeNode[] = []
        const visited = new Set<string>([tableName])
        const queue: Array<{ table: string; depth: number }> = [{ table: tableName, depth: 0 }]

        while (queue.length > 0) {
            const item = queue.shift()
            if (!item) break
            const { table: current, depth } = item
            for (const [otherTable, fks] of fkMap) {
                if (visited.has(otherTable)) continue
                const hasCascade = fks.some((fk) => fk.table === current && fk.on_delete.toUpperCase() === 'CASCADE')
                if (!hasCascade) continue
                visited.add(otherTable)
                const cnt = await db.select<[{ count: number }]>(
                    `SELECT COUNT(*) AS count FROM ${quoteQualifiedIdentifier(otherTable, 'sqlite')}`,
                )
                cascadeNodes.push({
                    tableName: otherTable,
                    rowCount: cnt[0]?.count ?? 0,
                    depth: depth + 1,
                    parentTable: current,
                })
                queue.push({ table: otherTable, depth: depth + 1 })
            }
        }

        return { rowCount, cascadeNodes }
    }

    async runDdl(path: string, sql: string): Promise<void> {
        const db = await this.open(path)
        await db.execute(sql)
    }

    /**
     * Runs a script that manages its own transaction (see alter-table.utils) on one connection.
     * On failure the connection is restored before it goes back to the pool.
     */
    async runDdlScript(path: string, statements: string[]): Promise<void> {
        const db = await this.open(path)
        await db.batch(
            statements.map((sql) => ({ sql })),
            { transactional: false, onError: [{ sql: 'ROLLBACK' }, { sql: 'PRAGMA foreign_keys = ON' }] },
        )
    }

    async loadSchema(path: string, alias: string): Promise<DatabaseSchema> {
        const db = await this.open(path)
        const [tableRows, viewRows, triggerRows] = await Promise.all([
            db.select<{ name: string }[]>(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            ),
            db.select<SqliteMasterRow[]>(
                "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='view' ORDER BY name",
            ),
            db.select<SqliteMasterRow[]>(
                "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name",
            ),
        ])

        const views: ViewSchema[] = viewRows.map((v) => ({ name: v.name, sql: v.sql ?? '' }))
        const triggers: TriggerSchema[] = triggerRows.map((t) => ({
            name: t.name,
            table: t.tbl_name,
            sql: t.sql ?? '',
        }))

        const tables: TableSchema[] = []

        for (const row of tableRows) {
            const tableIdentifier = quoteIdentifier(row.name, 'sqlite')
            const [columns, fkRows, idxRows] = await Promise.all([
                db.select<PragmaColumnRow[]>(`PRAGMA table_info(${tableIdentifier})`),
                db.select<PragmaFKRow[]>(`PRAGMA foreign_key_list(${tableIdentifier})`),
                db.select<PragmaIndexRow[]>(`PRAGMA index_list(${tableIdentifier})`),
            ])

            const userIndexes = idxRows.filter((idx) => idx.origin === 'c')
            const indexInfos = await Promise.all(
                userIndexes.map((idx) =>
                    db.select<PragmaIndexInfoRow[]>(`PRAGMA index_info(${quoteIdentifier(idx.name, 'sqlite')})`),
                ),
            )

            tables.push({
                name: row.name,
                columns: columns.map((c) => ({
                    name: c.name,
                    type: c.type || 'TEXT',
                    nullable: c.notnull === 0,
                    primaryKey: c.pk > 0,
                    defaultValue: c.dflt_value ?? undefined,
                })),
                foreignKeys: fkRows.map((fk) => ({
                    column: fk.from,
                    referencesTable: fk.table,
                    referencesColumn: fk.to,
                })),
                indexes: userIndexes.map((idx, i) => ({
                    name: idx.name,
                    columns: (indexInfos[i] ?? []).sort((a, b) => a.seqno - b.seqno).map((r) => r.name),
                    unique: idx.unique === 1,
                })),
            })
        }

        return { path, alias, tables, views, triggers }
    }

    private open(path: string): Promise<SqlClient> {
        return connectSql({ engine: 'sqlite', path })
    }

    private normalizeSql(sql: string): string {
        const normalized = sql.trim().replace(/;+$/, '').trim()
        if (!normalized) throw new Error('SQL cannot be empty')
        return normalized
    }

    private toSafeNonNegativeInt(value: number): number {
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
    }

    private toSafePreviewLimit(value: number): number {
        return Math.min(this.toSafeNonNegativeInt(value), MAX_SQLITE_PREVIEW_ROWS)
    }
}
