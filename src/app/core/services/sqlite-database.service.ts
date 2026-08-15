import { Injectable } from '@angular/core'
import type { DatabaseSchema, TableSchema, TriggerSchema, ViewSchema } from '@quarrydb/shared'
import { quoteIdentifier, quoteQualifiedIdentifier } from '@quarrydb/shared/sql-identifiers'
import { open } from '@tauri-apps/plugin-dialog'
import Database from '@tauri-apps/plugin-sql'
import type { EditOperation } from '../store/edit.store'

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
        const db = await Database.load(`sqlite://${path}`)
        const normalizedSql = this.normalizeSql(sql)
        const safeLimit = this.toSafeNonNegativeInt(previewLimit)
        try {
            const [countResult, rows] = await Promise.all([
                db.select<[{ count: number }]>(`SELECT COUNT(*) AS count FROM (${normalizedSql}) AS quarry_count`),
                db.select<Record<string, unknown>[]>(`SELECT * FROM (${normalizedSql}) AS quarry_preview LIMIT ?`, [
                    safeLimit,
                ]),
            ])
            const columns = rows.length > 0 ? Object.keys(rows[0]) : []
            return { rows, columns, total: countResult[0]?.count ?? 0 }
        } finally {
            await db.close()
        }
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
        const db = await Database.load(`sqlite://${path}`)
        try {
            const source = quoteQualifiedIdentifier(tableName, 'sqlite')
            const where = filter ? ` WHERE ${quoteIdentifier(filter.col, 'sqlite')} = ?` : ''
            const orderBy = sortCol
                ? ` ORDER BY ${quoteIdentifier(sortCol, 'sqlite')} ${sortDir === 'DESC' ? 'DESC' : 'ASC'}`
                : ''
            const filterArgs = filter ? [filter.value] : []
            const safeLimit = this.toSafeNonNegativeInt(limit)
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
        } finally {
            await db.close()
        }
    }

    async fetchAllRows(
        path: string,
        tableName: string,
        sortCol?: string,
        sortDir?: 'ASC' | 'DESC',
    ): Promise<Record<string, unknown>[]> {
        const db = await Database.load(`sqlite://${path}`)
        try {
            const orderBy = sortCol
                ? ` ORDER BY ${quoteIdentifier(sortCol, 'sqlite')} ${sortDir === 'DESC' ? 'DESC' : 'ASC'}`
                : ''
            return await db.select<Record<string, unknown>[]>(
                `SELECT * FROM ${quoteQualifiedIdentifier(tableName, 'sqlite')}${orderBy}`,
            )
        } finally {
            await db.close()
        }
    }

    async executeQueryFull(path: string, sql: string): Promise<Record<string, unknown>[]> {
        const db = await Database.load(`sqlite://${path}`)
        try {
            return await db.select<Record<string, unknown>[]>(this.normalizeSql(sql))
        } finally {
            await db.close()
        }
    }

    async applyEdits(path: string, tableName: string, ops: EditOperation[]): Promise<void> {
        const db = await Database.load(`sqlite://${path}`)
        try {
            await db.execute('BEGIN')
            try {
                for (const op of ops) {
                    if (op.kind === 'update') {
                        const cols = Object.keys(op.changes)
                        const pks = Object.keys(op.pkValues)
                        if (cols.length === 0 || pks.length === 0) continue
                        const setClauses = cols.map((k) => `${quoteIdentifier(k, 'sqlite')} = ?`).join(', ')
                        const whereClauses = pks.map((k) => `${quoteIdentifier(k, 'sqlite')} = ?`).join(' AND ')
                        await db.execute(
                            `UPDATE ${quoteQualifiedIdentifier(tableName, 'sqlite')} SET ${setClauses} WHERE ${whereClauses}`,
                            [...Object.values(op.changes), ...Object.values(op.pkValues)],
                        )
                    } else if (op.kind === 'delete') {
                        const pks = Object.keys(op.pkValues)
                        if (pks.length === 0) continue
                        const whereClauses = pks.map((k) => `${quoteIdentifier(k, 'sqlite')} = ?`).join(' AND ')
                        await db.execute(
                            `DELETE FROM ${quoteQualifiedIdentifier(tableName, 'sqlite')} WHERE ${whereClauses}`,
                            Object.values(op.pkValues),
                        )
                    } else if (op.kind === 'insert') {
                        const cols = Object.keys(op.values)
                        if (cols.length === 0) continue
                        const colList = cols.map((k) => quoteIdentifier(k, 'sqlite')).join(', ')
                        const placeholders = cols.map(() => '?').join(', ')
                        await db.execute(
                            `INSERT INTO ${quoteQualifiedIdentifier(tableName, 'sqlite')} (${colList}) VALUES (${placeholders})`,
                            Object.values(op.values),
                        )
                    }
                }
                await db.execute('COMMIT')
            } catch (err) {
                await db.execute('ROLLBACK')
                throw err
            }
        } finally {
            await db.close()
        }
    }

    async getTableImpact(path: string, tableName: string, allTableNames: string[]): Promise<TableImpact> {
        const db = await Database.load(`sqlite://${path}`)
        try {
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
                    const hasCascade = fks.some(
                        (fk) => fk.table === current && fk.on_delete.toUpperCase() === 'CASCADE',
                    )
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
        } finally {
            await db.close()
        }
    }

    async runDdl(path: string, sql: string): Promise<void> {
        const db = await Database.load(`sqlite://${path}`)
        try {
            await db.execute(sql)
        } finally {
            await db.close()
        }
    }

    async runDdlScript(path: string, statements: string[]): Promise<void> {
        const db = await Database.load(`sqlite://${path}`)
        try {
            for (const sql of statements) {
                await db.execute(sql)
            }
        } catch (err) {
            try {
                await db.execute('ROLLBACK')
            } catch {
                /* not in a transaction */
            }
            try {
                await db.execute('PRAGMA foreign_keys = ON')
            } catch {
                /* ignore */
            }
            throw err
        } finally {
            await db.close()
        }
    }

    async loadSchema(path: string, alias: string): Promise<DatabaseSchema> {
        const db = await Database.load(`sqlite://${path}`)
        try {
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
        } finally {
            await db.close()
        }
    }

    private normalizeSql(sql: string): string {
        const normalized = sql.trim().replace(/;+$/, '').trim()
        if (!normalized) throw new Error('SQL cannot be empty')
        return normalized
    }

    private toSafeNonNegativeInt(value: number): number {
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
    }
}
