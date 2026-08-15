import { describe, expect, it } from 'vitest'
import { serializeRedisKeyspace } from './redis-export'

describe('serializeRedisKeyspace', () => {
    it('preserves typed values and point-in-time TTL observations as JSON', () => {
        const output = serializeRedisKeyspace([
            { key: 'users:1', kind: 'hash', ttlMs: 30000, value: ['name', 'Ada'] },
            { key: 'queue', kind: 'list', ttlMs: -1, value: ['first', 'second'] },
        ])

        expect(JSON.parse(output)).toEqual([
            { key: 'users:1', kind: 'hash', ttlMs: 30000, value: ['name', 'Ada'] },
            { key: 'queue', kind: 'list', ttlMs: -1, value: ['first', 'second'] },
        ])
    })
})
