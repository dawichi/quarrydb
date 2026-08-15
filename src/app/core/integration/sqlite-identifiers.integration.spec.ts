import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SqliteDatabaseService } from '../services/sqlite-database.service'
import { closeFixtureDbs, seedFixtureDb } from './fixtures/fake-tauri-database'

vi.mock('@tauri-apps/plugin-sql', async () => {
    const { FakeDatabase } = await import('./fixtures/fake-tauri-database')
    return { default: FakeDatabase }
})

const FIXTURE_PATH = 'hostile-identifiers.test.db'
const TABLE = 'odd"table'
const COLUMN = 'odd"column'
const SETUP_SQL = `
CREATE TABLE "odd""table" ("id" INTEGER PRIMARY KEY, "odd""column" TEXT NOT NULL);
INSERT INTO "odd""table" ("id", "odd""column") VALUES (1, 'first'), (2, 'second');
`

const db = new SqliteDatabaseService()

beforeEach(() => seedFixtureDb(FIXTURE_PATH, SETUP_SQL))
afterAll(() => closeFixtureDbs())

describe('SQLite dynamic identifiers (integration)', () => {
    it('supports hostile table and column names across browse, sort, and filter paths', async () => {
        const result = await db.queryRows(FIXTURE_PATH, TABLE, 10, 0, COLUMN, 'DESC', {
            col: COLUMN,
            value: 'second',
        })

        expect(result.total).toBe(1)
        expect(result.rows).toEqual([{ id: 2, [COLUMN]: 'second' }])
    })

    it('supports hostile table and column names across schema and edit paths', async () => {
        const schema = await db.loadSchema(FIXTURE_PATH, 'test')
        expect(schema.tables[0]?.name).toBe(TABLE)
        expect(schema.tables[0]?.columns.map((column) => column.name)).toEqual(['id', COLUMN])

        await db.applyEdits(FIXTURE_PATH, TABLE, [
            { kind: 'update', pkValues: { id: 1 }, changes: { [COLUMN]: 'updated' } },
        ])

        await expect(db.fetchAllRows(FIXTURE_PATH, TABLE, COLUMN, 'ASC')).resolves.toEqual([
            { id: 2, [COLUMN]: 'second' },
            { id: 1, [COLUMN]: 'updated' },
        ])
    })
})
