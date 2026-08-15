import { Injectable } from '@angular/core'
import { quoteIdentifier, quoteQualifiedIdentifier, type SqlIdentifierDialect } from '@quarrydb/shared/sql-identifiers'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

export type ExportFormat = 'csv' | 'json' | 'sql' | 'md'

@Injectable({ providedIn: 'root' })
export class ExportService {
    toCsv(columns: string[], rows: Record<string, unknown>[]): string {
        const escapeCell = (v: unknown): string => {
            if (v === null || v === undefined) return ''
            const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
            if (s.includes(',') || s.includes('\n') || s.includes('"')) {
                return `"${s.replaceAll('"', '""')}"`
            }
            return s
        }
        const header = columns.map(escapeCell).join(',')
        const body = rows.map((row) => columns.map((col) => escapeCell(row[col])).join(',')).join('\n')
        return `${header}\n${body}`
    }

    toJson(rows: Record<string, unknown>[]): string {
        return JSON.stringify(rows, null, 2)
    }

    toSqlInserts(
        tableName: string,
        columns: string[],
        rows: Record<string, unknown>[],
        dialect: SqlIdentifierDialect = 'sqlite',
    ): string {
        const colList = columns.map((c) => quoteIdentifier(c, dialect)).join(', ')
        const escapeVal = (v: unknown): string => {
            if (v === null || v === undefined) return 'NULL'
            if (typeof v === 'number') return String(v)
            if (typeof v === 'boolean') return v ? '1' : '0'
            return `'${String(v).replaceAll("'", "''")}'`
        }
        return rows
            .map((row) => {
                const vals = columns.map((col) => escapeVal(row[col])).join(', ')
                return `INSERT INTO ${quoteQualifiedIdentifier(tableName, dialect)} (${colList}) VALUES (${vals});`
            })
            .join('\n')
    }

    toMarkdown(columns: string[], rows: Record<string, unknown>[]): string {
        const escapeCell = (v: unknown): string => {
            if (v === null || v === undefined) return ''
            const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
            return s.replaceAll('|', '\\|').replaceAll('\n', ' ')
        }
        const header = `| ${columns.join(' | ')} |`
        const separator = `| ${columns.map(() => '---').join(' | ')} |`
        const body = rows.map((row) => `| ${columns.map((col) => escapeCell(row[col])).join(' | ')} |`).join('\n')
        return `${header}\n${separator}\n${body}`
    }

    async saveFile(content: string, defaultName: string, ext: string): Promise<boolean> {
        const filePath = await save({
            defaultPath: defaultName,
            filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
        })
        if (!filePath) return false
        await invoke('write_text_file', { path: filePath, content, ext })
        return true
    }
}
