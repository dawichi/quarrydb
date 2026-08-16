import { describe, expect, it } from 'vitest'
import { describeSqliteError } from './sqlite-error'

describe('describeSqliteError', () => {
    it('turns locked database errors into actionable guidance', () => {
        expect(describeSqliteError(new Error('SQLITE_BUSY: database is locked'), 'Browse failed')).toBe(
            'Browse failed: the database is busy or locked. Close other writers and try again.',
        )
    })

    it('explains read-only database failures', () => {
        expect(describeSqliteError('attempt to write a readonly database', 'Edit failed')).toBe(
            'Edit failed: the database is read-only. Check file permissions or open a writable copy.',
        )
    })

    it('explains invalid and inaccessible files', () => {
        expect(describeSqliteError(new Error('file is not a database'), 'Open failed')).toBe(
            'Open failed: the file is not a readable SQLite database.',
        )
        expect(describeSqliteError(new Error('unable to open database file'), 'Open failed')).toBe(
            'Open failed: the database file could not be opened. Check that it still exists and is accessible.',
        )
    })

    it('preserves useful unknown messages and uses a fallback for empty errors', () => {
        expect(describeSqliteError(new Error('syntax error near SELECT'))).toBe('syntax error near SELECT')
        expect(describeSqliteError({}, 'Unknown SQLite failure')).toBe('Unknown SQLite failure')
    })
})
