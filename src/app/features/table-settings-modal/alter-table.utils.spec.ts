import type { Column, ForeignKey, Index } from '@quarrydb/shared'
import { describe, expect, it } from 'vitest'
import {
    buildAddColumnSql,
    buildDropColumnScript,
    buildRenameColumnSql,
    buildRenameTableSql,
} from './alter-table.utils'

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

describe('buildDropColumnScript', () => {
    const idCol: Column = { name: 'id', type: 'INTEGER', nullable: false, primaryKey: true }
    const nameCol: Column = { name: 'name', type: 'TEXT', nullable: false, primaryKey: false }
    const scoreCol: Column = { name: 'score', type: 'REAL', nullable: false, primaryKey: false, defaultValue: '0.0' }

    it('generates the full rebuild sequence', () => {
        const stmts = buildDropColumnScript('users', 'email', [idCol, nameCol], [], [])
        expect(stmts[0]).toBe('PRAGMA foreign_keys = OFF')
        expect(stmts[1]).toBe('BEGIN')
        expect(stmts[stmts.length - 2]).toBe('COMMIT')
        expect(stmts[stmts.length - 1]).toBe('PRAGMA foreign_keys = ON')
    })

    it('creates the new table with only remaining columns', () => {
        const stmts = buildDropColumnScript('users', 'email', [idCol, nameCol], [], [])
        const create = stmts.find((s) => s.startsWith('CREATE TABLE'))!
        expect(create).toContain('"__quarry_new_users"')
        expect(create).toContain('"id" INTEGER PRIMARY KEY')
        expect(create).toContain('"name" TEXT NOT NULL')
        expect(create).not.toContain('"email"')
    })

    it('copies only the remaining columns in the INSERT', () => {
        const stmts = buildDropColumnScript('users', 'email', [idCol, nameCol], [], [])
        const insert = stmts.find((s) => s.startsWith('INSERT INTO'))!
        expect(insert).toBe('INSERT INTO "__quarry_new_users" SELECT "id", "name" FROM "users"')
    })

    it('includes DEFAULT in the CREATE TABLE when present', () => {
        const stmts = buildDropColumnScript('stats', 'email', [idCol, scoreCol], [], [])
        const create = stmts.find((s) => s.startsWith('CREATE TABLE'))!
        expect(create).toContain('"score" REAL NOT NULL DEFAULT 0.0')
    })

    it('drops the FK for the removed column and keeps the rest', () => {
        const fks: ForeignKey[] = [
            { column: 'email', referencesTable: 'domains', referencesColumn: 'id' },
            { column: 'name', referencesTable: 'labels', referencesColumn: 'id' },
        ]
        const stmts = buildDropColumnScript('users', 'email', [idCol, nameCol], fks, [])
        const create = stmts.find((s) => s.startsWith('CREATE TABLE'))!
        expect(create).not.toContain('domains')
        expect(create).toContain('FOREIGN KEY ("name") REFERENCES "labels" ("id")')
    })

    it('recreates indexes that reference only remaining columns', () => {
        const indexes: Index[] = [
            { name: 'idx_name', columns: ['name'], unique: false },
            { name: 'idx_email', columns: ['email'], unique: true },
            { name: 'idx_name_email', columns: ['name', 'email'], unique: false },
        ]
        const stmts = buildDropColumnScript('users', 'email', [idCol, nameCol], [], indexes)
        expect(stmts.some((s) => s.includes('"idx_name"'))).toBe(true)
        expect(stmts.some((s) => s.includes('"idx_email"'))).toBe(false)
        expect(stmts.some((s) => s.includes('"idx_name_email"'))).toBe(false)
    })

    it('marks unique indexes with UNIQUE keyword', () => {
        const indexes: Index[] = [{ name: 'idx_name', columns: ['name'], unique: true }]
        const stmts = buildDropColumnScript('users', 'email', [idCol, nameCol], [], indexes)
        expect(stmts.some((s) => s.startsWith('CREATE UNIQUE INDEX'))).toBe(true)
    })
})
