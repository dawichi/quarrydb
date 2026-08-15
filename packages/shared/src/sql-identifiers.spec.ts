import { describe, expect, it } from 'vitest'
import { quoteIdentifier, quoteQualifiedIdentifier } from './sql-identifiers'

describe('SQL identifier quoting', () => {
    it('escapes SQLite quote characters without changing identifier boundaries', () => {
        expect(quoteIdentifier('odd"name', 'sqlite')).toBe('"odd""name"')
    })

    it('escapes MySQL quote characters without changing identifier boundaries', () => {
        expect(quoteIdentifier('odd`name', 'mysql')).toBe('`odd``name`')
    })

    it('quotes each qualified component independently', () => {
        expect(quoteQualifiedIdentifier('reporting.orders', 'mysql')).toBe('`reporting`.`orders`')
        expect(quoteQualifiedIdentifier('reporting.orders', 'sqlite')).toBe('"reporting"."orders"')
    })

    it('rejects empty or NUL-containing components', () => {
        expect(() => quoteIdentifier('', 'sqlite')).toThrow()
        expect(() => quoteIdentifier('users\0', 'sqlite')).toThrow()
        expect(() => quoteQualifiedIdentifier('reporting.', 'mysql')).toThrow()
    })
})
