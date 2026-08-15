import { describe, expect, it } from 'vitest'
import { parseRedisCommand } from './redis-command-parser'

describe('parseRedisCommand', () => {
    it('preserves quoted spaces and escaped characters as command arguments', () => {
        expect(parseRedisCommand('SET greeting "hello redis"')).toEqual({
            args: ['SET', 'greeting', 'hello redis'],
            error: null,
        })
    })

    it('rejects empty and unclosed commands', () => {
        expect(parseRedisCommand('   ').error).toBe('Redis command cannot be empty')
        expect(parseRedisCommand("SET key 'value").error).toBe('Unclosed quote in Redis command')
    })
})
