import { Injectable } from '@angular/core'
import type { DatabaseSchema, TableSchema, TriggerSchema, ViewSchema } from '@quarrydb/shared'
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
}

interface SqliteMasterRow {
    name: string
    tbl_name: string
    sql: string | null
}

@Injectable({ providedIn: 'root' })
export class DatabaseService {
    // ─── Public Methods ───────────────────────────────────────────────────────
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
        try {
            const [countResult, rows] = await Promise.all([
                db.select<[{ count: number }]>(`SELECT COUNT(*) as count FROM (${sql})`),
                db.select<Record<string, unknown>[]>(`${sql} LIMIT ?`, [previewLimit]),
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
            const where = filter ? ` WHERE "${filter.col}" = ?` : ''
            const orderBy = sortCol ? ` ORDER BY "${sortCol}" ${sortDir ?? 'ASC'}` : ''
            const filterArgs = filter ? [filter.value] : []
            const [countResult, rows] = await Promise.all([
                db.select<[{ count: number }]>(`SELECT COUNT(*) as count FROM "${tableName}"${where}`, filterArgs),
                db.select<Record<string, unknown>[]>(
                    `SELECT * FROM "${tableName}"${where}${orderBy} LIMIT ? OFFSET ?`,
                    [...filterArgs, limit, offset],
                ),
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
            const orderBy = sortCol ? ` ORDER BY "${sortCol}" ${sortDir ?? 'ASC'}` : ''
            return await db.select<Record<string, unknown>[]>(`SELECT * FROM "${tableName}"${orderBy}`)
        } finally {
            await db.close()
        }
    }

    async executeQueryFull(path: string, sql: string): Promise<Record<string, unknown>[]> {
        const db = await Database.load(`sqlite://${path}`)
        try {
            return await db.select<Record<string, unknown>[]>(sql)
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
                        const setClauses = cols.map((k) => `"${k}" = ?`).join(', ')
                        const whereClauses = pks.map((k) => `"${k}" = ?`).join(' AND ')
                        await db.execute(`UPDATE "${tableName}" SET ${setClauses} WHERE ${whereClauses}`, [
                            ...Object.values(op.changes),
                            ...Object.values(op.pkValues),
                        ])
                    } else if (op.kind === 'delete') {
                        const pks = Object.keys(op.pkValues)
                        const whereClauses = pks.map((k) => `"${k}" = ?`).join(' AND ')
                        await db.execute(`DELETE FROM "${tableName}" WHERE ${whereClauses}`, Object.values(op.pkValues))
                    } else if (op.kind === 'insert') {
                        const cols = Object.keys(op.values)
                        const colList = cols.map((k) => `"${k}"`).join(', ')
                        const placeholders = cols.map(() => '?').join(', ')
                        await db.execute(
                            `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders})`,
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
            const countResult = await db.select<[{ count: number }]>(`SELECT COUNT(*) as count FROM "${tableName}"`)
            const rowCount = countResult[0]?.count ?? 0

            // Build FK map: otherTable → its declared FK rows
            const fkMap = new Map<string, PragmaFKRow[]>()
            for (const t of allTableNames) {
                if (t === tableName) continue
                const fks = await db.select<PragmaFKRow[]>(`PRAGMA foreign_key_list("${t}")`)
                fkMap.set(t, fks)
            }

            // BFS following ON DELETE CASCADE edges to find the full domino chain
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
                    const cnt = await db.select<[{ count: number }]>(`SELECT COUNT(*) as count FROM "${otherTable}"`)
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

    async loadSchema(path: string, alias: string): Promise<DatabaseSchema> {
        const db = await Database.load(`sqlite://${path}`)

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
            const [columns, fkRows, idxRows] = await Promise.all([
                db.select<PragmaColumnRow[]>(`PRAGMA table_info("${row.name}")`),
                db.select<PragmaFKRow[]>(`PRAGMA foreign_key_list("${row.name}")`),
                db.select<PragmaIndexRow[]>(`PRAGMA index_list("${row.name}")`),
            ])

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
                indexes: idxRows.map((idx) => ({
                    name: idx.name,
                    columns: [],
                    unique: idx.unique === 1,
                })),
            })
        }

        await db.close()
        return { path, alias, tables, views, triggers }
    }
}
