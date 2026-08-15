import { describe, expect, it } from 'vitest'
import { describeSafeError } from './safe-error'

describe('describeSafeError', () => {
    it('redacts credentials embedded in database URLs', () => {
        expect(describeSafeError(new Error('failed for mysql://quarry:secret%20word@db.internal:3306/app'))).toBe(
            'failed for mysql://[redacted]@db.internal:3306/app',
        )
        expect(describeSafeError('redis connection rediss://user:p@ss@example.test:6380/0')).toBe(
            'redis connection rediss://[redacted]@example.test:6380/0',
        )
    })

    it('redacts runtime secrets that are not part of a URL', () => {
        expect(describeSafeError('authentication failed for secret-token', 'Connection failed', ['secret-token'])).toBe(
            'authentication failed for [redacted]',
        )
    })

    it('uses a stable fallback for unknown errors', () => {
        expect(describeSafeError({ reason: 'offline' }, 'Could not connect')).toBe('Could not connect')
    })
})
