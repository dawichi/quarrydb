import { describe, expect, it } from 'vitest'
import type { ColumnDef } from './create-table.utils'
import { generateCreateTableSql } from './create-table.utils'

function col(overrides: Pick<ColumnDef, 'name' | 'type'> & Partial<ColumnDef>): ColumnDef {
    return { id: '1', notNull: false, primaryKey: false, defaultValue: '', ...overrides }
}

describe('generateCreateTableSql', () => {
    it('generates a minimal single-column table', () => {
        const sql = generateCreateTableSql('users', [col({ name: 'id', type: 'INTEGER', primaryKey: true })])
        expect(sql).toBe('CREATE TABLE "users" (\n    "id" INTEGER PRIMARY KEY\n)')
    })

    it('generates a multi-column table', () => {
        const sql = generateCreateTableSql('users', [
            col({ name: 'id', type: 'INTEGER', primaryKey: true }),
            col({ name: 'email', type: 'TEXT', notNull: true }),
        ])
        expect(sql).toBe('CREATE TABLE "users" (\n    "id" INTEGER PRIMARY KEY,\n    "email" TEXT NOT NULL\n)')
    })

    it('adds DEFAULT clause when provided', () => {
        const sql = generateCreateTableSql('t', [col({ name: 'active', type: 'INTEGER', defaultValue: '1' })])
        expect(sql).toContain('DEFAULT 1')
    })

    it('trims whitespace from default value', () => {
        const sql = generateCreateTableSql('t', [col({ name: 'x', type: 'TEXT', defaultValue: '  hello  ' })])
        expect(sql).toContain('DEFAULT hello')
    })

    it('omits DEFAULT when value is blank', () => {
        const sql = generateCreateTableSql('t', [col({ name: 'x', type: 'TEXT', defaultValue: '   ' })])
        expect(sql).not.toContain('DEFAULT')
    })

    it('skips NOT NULL on primary key columns', () => {
        const sql = generateCreateTableSql('t', [col({ name: 'id', type: 'INTEGER', primaryKey: true, notNull: true })])
        expect(sql).not.toContain('NOT NULL')
    })

    it('uses table-level PRIMARY KEY constraint for composite PKs', () => {
        const sql = generateCreateTableSql('junction', [
            col({ name: 'a', type: 'INTEGER', primaryKey: true }),
            col({ name: 'b', type: 'INTEGER', primaryKey: true }),
        ])
        expect(sql).toContain('PRIMARY KEY ("a", "b")')
        expect(sql).not.toMatch(/"a" INTEGER PRIMARY KEY/)
        expect(sql).not.toMatch(/"b" INTEGER PRIMARY KEY/)
    })

    it('preserves column order in output', () => {
        const sql = generateCreateTableSql('t', [col({ name: 'z', type: 'TEXT' }), col({ name: 'a', type: 'TEXT' })])
        const zPos = sql.indexOf('"z"')
        const aPos = sql.indexOf('"a"')
        expect(zPos).toBeLessThan(aPos)
    })

    it('quotes table and column names', () => {
        const sql = generateCreateTableSql('my table', [col({ name: 'my col', type: 'TEXT' })])
        expect(sql).toContain('"my table"')
        expect(sql).toContain('"my col"')
    })
})
