import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../services/database.service'
import type { EditOperation } from '../store/edit.store'
import { closeFixtureDbs, seedFixtureDb } from './fixtures/fake-tauri-database'
import { SAMPLE_SCHEMA_SQL } from './fixtures/sample-schema'

// See pipeline-run.integration.spec.ts for why this mock exists and how it's hoisted.
vi.mock('@tauri-apps/plugin-sql', async () => {
    const { FakeDatabase } = await import('./fixtures/fake-tauri-database')
    return { default: FakeDatabase }
})

const FIXTURE_PATH = 'edit-mode.test.db'

const db = new DatabaseService()

// Re-seed before every test so each one starts from the same known data set —
// `applyEdits` mutates real rows, so tests can't share state.
beforeEach(() => seedFixtureDb(FIXTURE_PATH, SAMPLE_SCHEMA_SQL))

afterAll(() => closeFixtureDbs())

function fetchCustomers() {
    return db.fetchAllRows(FIXTURE_PATH, 'customers', 'id', 'ASC')
}

describe('edit mode → apply (integration)', () => {
    it('commits a mixed update/insert/delete batch as a single atomic transaction', async () => {
        const ops: EditOperation[] = [
            {
                kind: 'update',
                pkValues: { id: 1 },
                changes: { name: 'Alice Cooper' },
                original: { id: 1, name: 'Alice', email: 'alice@example.com' },
            },
            { kind: 'insert', values: { id: 5, name: 'Eve', email: 'eve@example.com' } },
            // Dave (id 4) has no orders — safe to delete without tripping the FK constraint.
            { kind: 'delete', pkValues: { id: 4 }, original: { id: 4, name: 'Dave', email: 'dave@example.com' } },
        ]

        await db.applyEdits(FIXTURE_PATH, 'customers', ops)

        expect(await fetchCustomers()).toEqual([
            { id: 1, name: 'Alice Cooper', email: 'alice@example.com' },
            { id: 2, name: 'Bob', email: 'bob@example.com' },
            { id: 3, name: 'Carol', email: 'carol@example.com' },
            { id: 5, name: 'Eve', email: 'eve@example.com' },
        ])
    })

    it('rolls back the entire batch — including otherwise-valid ops — on a constraint failure', async () => {
        const ops: EditOperation[] = [
            // Valid on its own — would succeed if applied alone.
            {
                kind: 'update',
                pkValues: { id: 2 },
                changes: { name: 'Bob Updated' },
                original: { id: 2, name: 'Bob', email: 'bob@example.com' },
            },
            // Violates the UNIQUE constraint on email — should abort the whole transaction.
            { kind: 'insert', values: { id: 5, name: 'Eve', email: 'alice@example.com' } },
        ]

        await expect(db.applyEdits(FIXTURE_PATH, 'customers', ops)).rejects.toThrow(/UNIQUE constraint/i)

        const rows = await fetchCustomers()
        expect(rows).toHaveLength(4)
        expect(rows.find((r) => r.id === 2)?.name).toBe('Bob') // update rolled back alongside the failed insert
    })

    it('rolls back on a foreign-key violation in a referencing table', async () => {
        const ops: EditOperation[] = [
            { kind: 'insert', values: { id: 99, customer_id: 999, total: 10, status: 'pending' } }, // no such customer
        ]

        await expect(db.applyEdits(FIXTURE_PATH, 'orders', ops)).rejects.toThrow(/FOREIGN KEY constraint/i)

        const orders = await db.fetchAllRows(FIXTURE_PATH, 'orders', 'id', 'ASC')
        expect(orders).toHaveLength(4)
    })
})
