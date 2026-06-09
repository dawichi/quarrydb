import { describe, expect, it } from 'vitest'
import { buildCreateIndexSql } from './index.utils'

describe('buildCreateIndexSql', () => {
    it('generates a basic non-unique single-column index', () => {
        expect(buildCreateIndexSql('users', 'idx_users_email', ['email'], false)).toBe(
            'CREATE INDEX "idx_users_email" ON "users" ("email")',
        )
    })

    it('generates a unique index', () => {
        expect(buildCreateIndexSql('users', 'idx_users_email', ['email'], true)).toBe(
            'CREATE UNIQUE INDEX "idx_users_email" ON "users" ("email")',
        )
    })

    it('generates a multi-column index', () => {
        expect(buildCreateIndexSql('orders', 'idx_orders_user_date', ['user_id', 'created_at'], false)).toBe(
            'CREATE INDEX "idx_orders_user_date" ON "orders" ("user_id", "created_at")',
        )
    })

    it('preserves column order', () => {
        const sql = buildCreateIndexSql('t', 'idx', ['z', 'a', 'm'], false)
        const zPos = sql.indexOf('"z"')
        const aPos = sql.indexOf('"a"')
        const mPos = sql.indexOf('"m"')
        expect(zPos).toBeLessThan(aPos)
        expect(aPos).toBeLessThan(mPos)
    })

    it('quotes table and index names', () => {
        const sql = buildCreateIndexSql('my table', 'my index', ['col'], false)
        expect(sql).toContain('"my table"')
        expect(sql).toContain('"my index"')
    })

    it('quotes column names', () => {
        const sql = buildCreateIndexSql('t', 'idx', ['my col'], false)
        expect(sql).toContain('"my col"')
    })

    it('unique flag produces no UNIQUE keyword when false', () => {
        const sql = buildCreateIndexSql('t', 'idx', ['col'], false)
        expect(sql).not.toContain('UNIQUE')
    })
})
