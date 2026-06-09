import { describe, expect, it } from 'vitest'
import { buildAddColumnSql, buildRenameColumnSql, buildRenameTableSql } from './alter-table.utils'

describe('buildRenameTableSql', () => {
    it('generates RENAME TO', () => {
        expect(buildRenameTableSql('users', 'people')).toBe('ALTER TABLE "users" RENAME TO "people"')
    })

    it('quotes names with spaces', () => {
        expect(buildRenameTableSql('my table', 'my people')).toBe('ALTER TABLE "my table" RENAME TO "my people"')
    })
})

describe('buildRenameColumnSql', () => {
    it('generates RENAME COLUMN', () => {
        expect(buildRenameColumnSql('users', 'name', 'full_name')).toBe(
            'ALTER TABLE "users" RENAME COLUMN "name" TO "full_name"',
        )
    })

    it('quotes column names with spaces', () => {
        expect(buildRenameColumnSql('users', 'first name', 'first_name')).toBe(
            'ALTER TABLE "users" RENAME COLUMN "first name" TO "first_name"',
        )
    })
})

describe('buildAddColumnSql', () => {
    it('generates minimal ADD COLUMN', () => {
        expect(buildAddColumnSql('users', { name: 'age', type: 'INTEGER', notNull: false, defaultValue: '' })).toBe(
            'ALTER TABLE "users" ADD COLUMN "age" INTEGER',
        )
    })

    it('includes NOT NULL and DEFAULT', () => {
        expect(buildAddColumnSql('users', { name: 'score', type: 'REAL', notNull: true, defaultValue: '0.0' })).toBe(
            'ALTER TABLE "users" ADD COLUMN "score" REAL NOT NULL DEFAULT 0.0',
        )
    })

    it('includes NOT NULL without DEFAULT', () => {
        expect(buildAddColumnSql('users', { name: 'tag', type: 'TEXT', notNull: true, defaultValue: '' })).toBe(
            'ALTER TABLE "users" ADD COLUMN "tag" TEXT NOT NULL',
        )
    })

    it('includes DEFAULT without NOT NULL', () => {
        expect(
            buildAddColumnSql('users', { name: 'status', type: 'TEXT', notNull: false, defaultValue: "'active'" }),
        ).toBe('ALTER TABLE "users" ADD COLUMN "status" TEXT DEFAULT \'active\'')
    })

    it('trims whitespace from default value', () => {
        expect(
            buildAddColumnSql('orders', { name: 'qty', type: 'INTEGER', notNull: true, defaultValue: '  1  ' }),
        ).toBe('ALTER TABLE "orders" ADD COLUMN "qty" INTEGER NOT NULL DEFAULT 1')
    })
})
