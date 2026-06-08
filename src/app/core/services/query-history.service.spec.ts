import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type QueryHistoryEntry, QueryHistoryService } from './query-history.service'

// The spec runs under vitest's `node` environment, which has no `localStorage` —
// stub a minimal in-memory stand-in so the service's persistence is testable.
let storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => {
        storage = new Map()
    },
})

function entry(
    overrides: Partial<Omit<QueryHistoryEntry, 'id' | 'executedAt'>> = {},
): Omit<QueryHistoryEntry, 'id' | 'executedAt'> {
    return {
        sql: 'SELECT * FROM "users"',
        steps: [],
        source: { path: '/db.sqlite', alias: 'main', tableName: 'users', columns: ['id', 'name'] },
        durationMs: 12,
        rowCount: 3,
        ...overrides,
    }
}

let service: QueryHistoryService

beforeEach(() => {
    storage.clear()
    service = new QueryHistoryService()
})

// ─── enabled flag ─────────────────────────────────────────────────────────────

describe('isEnabled / setEnabled', () => {
    it('is disabled by default', () => {
        expect(service.isEnabled()).toBe(false)
    })

    it('persists the enabled flag across instances', () => {
        service.setEnabled(true)
        expect(new QueryHistoryService().isEnabled()).toBe(true)

        service.setEnabled(false)
        expect(new QueryHistoryService().isEnabled()).toBe(false)
    })
})

// ─── load ─────────────────────────────────────────────────────────────────────

describe('load', () => {
    it('returns an empty array when nothing has been logged', () => {
        expect(service.load()).toEqual([])
    })

    it('falls back to an empty array on corrupt storage', () => {
        localStorage.setItem('quarry_query_history', '{not json')
        expect(service.load()).toEqual([])
    })
})

// ─── log ──────────────────────────────────────────────────────────────────────

describe('log', () => {
    it('does nothing while history is disabled', () => {
        service.log(entry())
        expect(service.load()).toEqual([])
    })

    it('appends an entry with a generated id and timestamp once enabled', () => {
        service.setEnabled(true)
        service.log(entry({ sql: 'SELECT * FROM "orders"' }))

        const all = service.load()
        expect(all).toHaveLength(1)
        expect(all[0]).toMatchObject({ sql: 'SELECT * FROM "orders"', durationMs: 12, rowCount: 3 })
        expect(all[0].id).toBeTruthy()
        expect(all[0].executedAt).toBeGreaterThan(0)
    })

    it('skips an entry that exactly repeats the last logged query for the same source', () => {
        service.setEnabled(true)
        service.log(entry({ sql: 'SELECT * FROM "users" WHERE active = 1' }))
        service.log(entry({ sql: 'SELECT * FROM "users" WHERE active = 1' }))

        expect(service.load()).toHaveLength(1)
    })

    it('logs again once the query actually changes, even back to a prior value', () => {
        service.setEnabled(true)
        service.log(entry({ sql: 'A' }))
        service.log(entry({ sql: 'B' }))
        service.log(entry({ sql: 'A' }))

        expect(service.load().map((e) => e.sql)).toEqual(['A', 'B', 'A'])
    })

    it('does not dedupe identical SQL run against a different table', () => {
        service.setEnabled(true)
        service.log(
            entry({
                sql: 'SELECT * FROM "t"',
                source: { path: '/db.sqlite', alias: 'main', tableName: 'a', columns: [] },
            }),
        )
        service.log(
            entry({
                sql: 'SELECT * FROM "t"',
                source: { path: '/db.sqlite', alias: 'main', tableName: 'b', columns: [] },
            }),
        )

        expect(service.load()).toHaveLength(2)
    })

    it('caps the log at 200 entries, dropping the oldest first', () => {
        service.setEnabled(true)
        for (let i = 0; i < 205; i++) service.log(entry({ sql: `SELECT ${i}` }))

        const all = service.load()
        expect(all).toHaveLength(200)
        expect(all[0].sql).toBe('SELECT 5')
        expect(all.at(-1)?.sql).toBe('SELECT 204')
    })
})

// ─── search ───────────────────────────────────────────────────────────────────

describe('search', () => {
    beforeEach(() => {
        service.setEnabled(true)
        service.log(
            entry({
                sql: 'SELECT * FROM "users" WHERE active = 1',
                source: { path: '/db.sqlite', alias: 'main', tableName: 'users', columns: [] },
            }),
        )
        service.log(
            entry({
                sql: 'SELECT count(*) FROM "orders"',
                source: { path: '/db.sqlite', alias: 'main', tableName: 'orders', columns: [] },
            }),
        )
    })

    it('returns every entry for a blank query', () => {
        expect(service.search('')).toHaveLength(2)
        expect(service.search('   ')).toHaveLength(2)
    })

    it('matches case-insensitively against the SQL text', () => {
        expect(service.search('where active')).toHaveLength(1)
        expect(service.search('WHERE ACTIVE')[0].source.tableName).toBe('users')
    })

    it('matches against the source table name', () => {
        expect(service.search('orders')).toHaveLength(1)
        expect(service.search('orders')[0].sql).toContain('count(*)')
    })

    it('returns nothing for a query that matches neither', () => {
        expect(service.search('nonexistent')).toEqual([])
    })
})

// ─── clear ────────────────────────────────────────────────────────────────────

describe('clear', () => {
    it('removes all logged entries', () => {
        service.setEnabled(true)
        service.log(entry())
        expect(service.load()).toHaveLength(1)

        service.clear()
        expect(service.load()).toEqual([])
    })
})
