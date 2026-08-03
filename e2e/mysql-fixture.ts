import type { Page } from '@playwright/test'

function installMysqlFixture(): void {
    const writes: Array<{ path: string; content: string; ext: string }> = []
    const columns = [
        { column_name: 'id', column_type: 'int', is_nullable: 'NO', column_key: 'PRI', column_default: '' },
        { column_name: 'name', column_type: 'varchar(255)', is_nullable: 'NO', column_key: '', column_default: '' },
        { column_name: 'price', column_type: 'decimal(10,2)', is_nullable: 'NO', column_key: '', column_default: '0.00' },
    ]
    const rows = [
        { id: 1, name: 'Laptop Pro 15"', price: '1299.99' },
        { id: 2, name: 'Wireless Keyboard', price: '89.99' },
    ]

    window.__quarryE2eWrites = writes
    window.__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: { query?: string; path?: string; content?: string; ext?: string }) => {
            const query = args.query ?? ''
            if (command === 'plugin:sql|load') return 'mysql://e2e'
            if (command === 'plugin:sql|close') return true
            if (command === 'plugin:sql|execute') return [0, 0]
            if (command === 'plugin:sql|select') {
                if (query === 'SHOW DATABASES') return [{ Database: 'quarry_demo' }]
                if (query.includes('information_schema.tables')) return [{ table_name: 'products' }]
                if (query.includes('information_schema.columns')) return columns
                if (query.includes('COUNT(*) as count')) return [{ count: rows.length }]
                if (query.includes('FROM `quarry_demo`.`products`')) return rows
                return []
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
