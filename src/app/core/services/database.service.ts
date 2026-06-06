import { Injectable } from '@angular/core'
import type { DatabaseSchema, TableSchema } from '@quarrydb/shared'
import { open } from '@tauri-apps/plugin-dialog'
import Database from '@tauri-apps/plugin-sql'

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
}

interface PragmaIndexRow {
    seq: number
    name: string
    unique: number
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
    ): Promise<{ rows: Record<string, unknown>[]; total: number }> {
        const db = await Database.load(`sqlite://${path}`)
        try {
            const orderBy = sortCol ? ` ORDER BY "${sortCol}" ${sortDir ?? 'ASC'}` : ''
            const [countResult, rows] = await Promise.all([
                db.select<[{ count: number }]>(`SELECT COUNT(*) as count FROM "${tableName}"`),
                db.select<Record<string, unknown>[]>(`SELECT * FROM "${tableName}"${orderBy} LIMIT ? OFFSET ?`, [
                    limit,
                    offset,
                ]),
            ])
            return { rows, total: countResult[0]?.count ?? 0 }
        } finally {
            await db.close()
        }
    }

    async loadSchema(path: string, alias: string): Promise<DatabaseSchema> {
        const db = await Database.load(`sqlite://${path}`)

        const tableRows = await db.select<{ name: string }[]>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )

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
        return { path, alias, tables }
    }
}
