import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDropColumnScript } from '../../features/table-settings-modal/alter-table.utils'
import { DatabaseService } from '../services/database.service'
import { closeFixtureDbs, seedFixtureDb } from './fixtures/fake-tauri-database'

vi.mock('@tauri-apps/plugin-sql', async () => {
    const { FakeDatabase } = await import('./fixtures/fake-tauri-database')
    return { default: FakeDatabase }
})

const FIXTURE_PATH = 'ddl.test.db'

const SETUP_SQL = `
CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0.0,
    notes TEXT
);

CREATE INDEX idx_products_sku ON products (sku);

INSERT INTO products (id, name, sku, price, notes) VALUES
    (1, 'Widget', 'WGT-001', 9.99, 'blue'),
    (2, 'Gadget', 'GDG-002', 24.99, NULL),
    (3, 'Doohickey', 'DHK-003', 4.49, 'fragile');
`

const db = new DatabaseService()

beforeEach(() => seedFixtureDb(FIXTURE_PATH, SETUP_SQL))
afterAll(() => closeFixtureDbs())

describe('drop column — rebuild dance (integration)', () => {
    it('removes the column and preserves all remaining rows', async () => {
        const remaining = [
            { name: 'id', type: 'INTEGER', nullable: false, primaryKey: true },
            { name: 'name', type: 'TEXT', nullable: false, primaryKey: false },
            { name: 'sku', type: 'TEXT', nullable: false, primaryKey: false },
            { name: 'price', type: 'REAL', nullable: false, primaryKey: false, defaultValue: '0.0' },
        ]
        const script = buildDropColumnScript(
            'products',
            'notes',
            remaining,
            [],
            [{ name: 'idx_products_sku', columns: ['sku'], unique: false }],
        )

        await db.runDdlScript(FIXTURE_PATH, script)

        const rows = await db.fetchAllRows(FIXTURE_PATH, 'products', 'id', 'ASC')
        expect(rows).toHaveLength(3)
        expect(rows[0]).toEqual({ id: 1, name: 'Widget', sku: 'WGT-001', price: 9.99 })
        expect(rows[1]).toEqual({ id: 2, name: 'Gadget', sku: 'GDG-002', price: 24.99 })
        expect(rows[2]).toEqual({ id: 3, name: 'Doohickey', sku: 'DHK-003', price: 4.49 })
        expect('notes' in rows[0]).toBe(false)
    })

    it('recreates surviving indexes', async () => {
        const remaining = [
            { name: 'id', type: 'INTEGER', nullable: false, primaryKey: true },
            { name: 'name', type: 'TEXT', nullable: false, primaryKey: false },
            { name: 'sku', type: 'TEXT', nullable: false, primaryKey: false },
            { name: 'price', type: 'REAL', nullable: false, primaryKey: false, defaultValue: '0.0' },
        ]
        const script = buildDropColumnScript(
            'products',
            'notes',
            remaining,
            [],
            [{ name: 'idx_products_sku', columns: ['sku'], unique: false }],
        )

        await db.runDdlScript(FIXTURE_PATH, script)

        // If the index was recreated, SQLite should be able to query via it without error.
        const rows = await db.executeQueryFull(
            FIXTURE_PATH,
            'SELECT name FROM products INDEXED BY idx_products_sku ORDER BY sku',
        )
        expect(rows).toHaveLength(3)
    })

    it('drops any index that covered the removed column', async () => {
        const remaining = [
            { name: 'id', type: 'INTEGER', nullable: false, primaryKey: true },
            { name: 'name', type: 'TEXT', nullable: false, primaryKey: false },
            { name: 'price', type: 'REAL', nullable: false, primaryKey: false, defaultValue: '0.0' },
            { name: 'notes', type: 'TEXT', nullable: true, primaryKey: false },
        ]
        // Drop 'sku' — which the index references; the index should not be recreated
        const script = buildDropColumnScript(
            'products',
            'sku',
            remaining,
            [],
            [{ name: 'idx_products_sku', columns: ['sku'], unique: false }],
        )

        await db.runDdlScript(FIXTURE_PATH, script)

        await expect(
            db.executeQueryFull(FIXTURE_PATH, 'SELECT name FROM products INDEXED BY idx_products_sku'),
        ).rejects.toThrow()
    })

    it('rolls back on a constraint violation and leaves the original table intact', async () => {
        // Supply a bad script: the INSERT references a column that won't exist in the new table
        const badScript = [
            'PRAGMA foreign_keys = OFF',
            'BEGIN',
            'CREATE TABLE "__quarry_new_products" ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL)',
            // This INSERT references columns not in the new table — will fail
            'INSERT INTO "__quarry_new_products" SELECT id, name, sku FROM "products"',
            'DROP TABLE "products"',
            'ALTER TABLE "__quarry_new_products" RENAME TO "products"',
            'COMMIT',
            'PRAGMA foreign_keys = ON',
        ]

        await expect(db.runDdlScript(FIXTURE_PATH, badScript)).rejects.toThrow()

        // Original table must still be intact
        const rows = await db.fetchAllRows(FIXTURE_PATH, 'products', 'id', 'ASC')
        expect(rows).toHaveLength(3)
    })
})
