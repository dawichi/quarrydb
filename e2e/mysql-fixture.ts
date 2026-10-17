import type { Page } from '@playwright/test'

function installMysqlFixture(): void {
    const writes: Array<{ path: string; content: string; ext: string }> = []
    const columns = [
        { column_name: 'id', column_type: 'int', is_nullable: 'NO', column_key: 'PRI', column_default: '' },
        { column_name: 'name', column_type: 'varchar(255)', is_nullable: 'NO', column_key: '', column_default: '' },
        { column_name: 'price', column_type: 'decimal(10,2)', is_nullable: 'NO', column_key: '', column_default: '0.00' },
    ]
    const rows = [
        { id: 1, name: 'Laptop Pro 15"', price: 1299.99 },
        { id: 2, name: 'Wireless Keyboard', price: 89.99 },
    ]

    window.__quarryE2eWrites = writes
    window.__TAURI_INTERNALS__ = {
        invoke: async (
            command: string,
            args: {
                sql?: string
                statements?: Array<{ sql: string }>
                target?: { connectionId?: string }
                path?: string
                content?: string
                ext?: string
            },
        ) => {
            const select = (query: string): Record<string, unknown>[] => {
                if (query === 'SELECT 1 AS ok') return [{ ok: 1 }]
                if (query.includes('information_schema.schemata')) return [{ name: 'quarry_demo' }]
                if (query.includes('information_schema.tables')) return [{ table_name: 'products' }]
                if (query.includes('table_name IN')) {
                    return columns.map((column) => ({ table_name: 'products', ...column }))
                }
                if (query.includes('information_schema.columns')) return columns
                if (query.includes('COUNT(*) AS count')) return [{ count: rows.length }]
                if (query.includes('FROM `quarry_demo`.`products`')) return rows
                return []
            }
            // Native SQL commands (src-tauri/src/sql): rows travel as arrays plus column names.
            if (command === 'sql_connect') return `mysql:${args.target?.connectionId ?? 'e2e'}`
            if (command === 'sql_disconnect') return null
            if (command === 'sql_execute') {
                return (args.statements ?? []).map((statement) => ({
                    rowsAffected: /^(UPDATE|DELETE)/.test(statement.sql) ? 1 : 0,
                    lastInsertId: null,
                }))
            }
            if (command === 'sql_select') {
                const result = select(args.sql ?? '')
                const names = Object.keys(result[0] ?? {})
                return {
                    columns: names,
                    rows: result.map((row) => names.map((name) => row[name])),
                    truncated: false,
                    durationMs: 0,
                }
            }
            if (command === 'plugin:event|listen') return 1
            if (command === 'plugin:updater|check') return null
            if (command === 'plugin:dialog|save') return '/e2e-export.csv'
            if (command === 'write_text_file') {
                writes.push({ path: args.path ?? '', content: args.content ?? '', ext: args.ext ?? '' })
                return true
            }
            return null
        },
    }
}

export async function useMysqlFixture(page: Page): Promise<void> {
    await page.addInitScript({ content: `(${installMysqlFixture.toString()})()` })
}
