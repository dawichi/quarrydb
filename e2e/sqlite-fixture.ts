import type { Page } from '@playwright/test'

const SQLITE_SESSION = {
    version: 1,
    providerId: 'sqlite',
    savedAt: Date.now(),
    workspace: {
        name: 'e2e.db',
        databases: [{ path: '/e2e.db', alias: 'main' }],
        activeTab: 'browse',
        selectedTable: { schemaAlias: 'main', tableName: 'products' },
    },
    pipeline: {
        source: {
            path: '/e2e.db',
            alias: 'main',
            tableName: 'products',
            columns: ['id', 'name', 'category', 'price', 'stock'],
        },
        steps: [],
        variableValues: {},
    },
}

function installSqliteFixture(): void {
    const products = [
        { id: 1, name: 'Laptop Pro 15"', category: 'Electronics', price: 1299.99, stock: 12 },
        { id: 2, name: 'Wireless Keyboard', category: 'Electronics', price: 89.99, stock: 45 },
        { id: 3, name: 'USB-C Hub 7-port', category: 'Electronics', price: 49.99, stock: 78 },
        { id: 4, name: 'Mechanical Keyboard', category: 'Electronics', price: 149.99, stock: 30 },
        { id: 5, name: 'Monitor 27" 4K', category: 'Electronics', price: 499.99, stock: 8 },
        { id: 6, name: 'Noise-Cancelling Headphones', category: 'Electronics', price: 279.99, stock: 22 },
        { id: 7, name: 'Clean Code', category: 'Books', price: 34.99, stock: 60 },
        { id: 8, name: 'The Pragmatic Programmer', category: 'Books', price: 39.99, stock: 55 },
        { id: 9, name: 'Designing Data-Intensive Apps', category: 'Books', price: 44.99, stock: 40 },
        { id: 10, name: 'Developer Hoodie', category: 'Clothing', price: 59.99, stock: 80 },
        { id: 11, name: 'Cargo Shorts', category: 'Clothing', price: 39.99, stock: 65 },
        { id: 12, name: 'Laptop Backpack 15"', category: 'Accessories', price: 79.99, stock: 35 },
        { id: 13, name: 'Standing Desk Mat', category: 'Home', price: 29.99, stock: 50 },
        { id: 14, name: 'Cable Organiser Set', category: 'Home', price: 9.99, stock: 120 },
    ]
    const columns = [
        { cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
        { cid: 1, name: 'name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 2, name: 'category', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 3, name: 'price', type: 'REAL', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 4, name: 'stock', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
    ]

    const writes: Array<{ path: string; content: string; ext: string }> = []
    const select = (query: string, values: unknown[] = []): unknown[] => {
        const normalized = query.replace(/\s+/g, ' ').trim()
        if (normalized.includes("type='table'")) return [{ name: 'products' }, { name: 'customers' }]
        if (normalized.includes("type='view'") || normalized.includes("type='trigger'")) return []
        if (normalized.startsWith('PRAGMA table_info("products")')) return columns
        if (normalized.startsWith('PRAGMA table_info("customers")')) return []
        if (normalized.startsWith('PRAGMA foreign_key_list') || normalized.startsWith('PRAGMA index_list')) return []
        if (normalized.startsWith('SELECT COUNT(*) as count FROM (')) {
            const filtered = normalized.includes("category = 'Books'") ? products.filter((row) => row.category === 'Books') : products
            return [{ count: filtered.length }]
        }
        if (normalized.startsWith('SELECT COUNT(*) as count FROM "products"')) return [{ count: products.length }]
        if (normalized.includes('FROM "products"')) {
            const filtered = normalized.includes("category = 'Books'") ? products.filter((row) => row.category === 'Books') : products
            const limit = Number(values.length > 1 ? values[0] : (values[0] ?? 100))
            const offset = Number(values.length > 1 ? values[1] : 0)
            return filtered.slice(Number.isFinite(offset) ? offset : 0, (Number.isFinite(offset) ? offset : 0) + limit)
        }
        return []
    }

    window.__quarryE2eWrites = writes
    window.__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: { query?: string; values?: unknown[]; db?: string; path?: string; content?: string; ext?: string }) => {
            if (command === 'plugin:sql|load') return args.db ?? 'sqlite:/e2e.db'
            if (command === 'plugin:sql|select') return select(args.query ?? '', args.values ?? [])
            if (command === 'plugin:sql|execute') {
                const query = args.query ?? ''
                const values = args.values ?? []
                const updateMatch = query.match(/UPDATE "products" SET "name" = \? WHERE "id" = \?/i)
                if (updateMatch) {
                    const row = products.find((product) => product.id === Number(values[1]))
                    if (row) row.name = String(values[0])
                }
                return [0, 0]
            }
            if (command === 'plugin:sql|close') return true
            if (command === 'plugin:dialog|open' || command === 'plugin:dialog|save') return '/e2e.db'
            if (command === 'write_text_file') {
                writes.push({ path: args.path ?? '', content: args.content ?? '', ext: args.ext ?? '' })
                return true
            }
            if (command === 'plugin:event|listen') return 1
            if (command === 'plugin:updater|check') return null
            return null
        },
    }
}

export async function useSqliteFixture(page: Page): Promise<void> {
    await page.addInitScript({ content: `(${installSqliteFixture.toString()})()` })
    await page.addInitScript((session) => {
        window.localStorage.setItem('quarry_session', JSON.stringify(session))
    }, SQLITE_SESSION)
}
