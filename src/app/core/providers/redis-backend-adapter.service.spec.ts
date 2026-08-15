import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RedisBackendAdapterService } from './redis-backend-adapter.service'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

const session = {
    target: {
        connectionId: 'redis-1',
        connectionName: 'Local Redis',
        host: '127.0.0.1',
        port: 6379,
        database: 0,
        tls: false,
    },
    password: 'secret',
    source: 'manual' as const,
    connectedAt: 1,
    serverVersion: '8.0.0',
    databaseSize: 2,
}

describe('RedisBackendAdapterService', () => {
    let service: RedisBackendAdapterService

    beforeEach(() => {
        service = new RedisBackendAdapterService()
        invoke.mockReset()
    })

    it('passes credentials only to the native connect boundary', async () => {
        invoke.mockResolvedValue({ server_version: '8.0.0', database_size: 2 })

        await expect(
            service.connect({ target: session.target, password: 'secret', source: 'manual' }),
        ).resolves.toMatchObject({ target: session.target, serverVersion: '8.0.0', databaseSize: 2 })
        expect(invoke).toHaveBeenCalledWith('redis_connect', {
            target: { ...session.target, password: 'secret' },
        })
    })

    it('maps native key detail fields and reuses the runtime-only password', async () => {
        invoke.mockResolvedValue({ key: 'greeting', kind: 'string', ttl_ms: -1, value: 'hello' })

        await expect(service.getKey(session, 'greeting')).resolves.toEqual({
            key: 'greeting',
            kind: 'string',
            ttlMs: -1,
            value: 'hello',
        })

        expect(invoke).toHaveBeenCalledWith('redis_get_key', {
            target: { ...session.target, password: 'secret' },
            key: 'greeting',
        })
    })

    it('maps native scan results to provider key summaries', async () => {
        invoke.mockResolvedValue({ cursor: 7, keys: ['users:1', 'users:2'] })

        await expect(service.scanKeys(session, 0, 'users:*', 100)).resolves.toEqual({
            cursor: 7,
            keys: [{ key: 'users:1' }, { key: 'users:2' }],
        })
    })

    it('maps bounded native keyspace exports and normalizes empty patterns', async () => {
        invoke.mockResolvedValue([
            { key: 'users:1', kind: 'hash', ttl_ms: 5000, value: ['name', 'Ada'] },
            { key: 'queue', kind: 'list', ttl_ms: -1, value: ['first'] },
        ])

        await expect(service.exportKeyspace(session, '  ', 25)).resolves.toEqual([
            { key: 'users:1', kind: 'hash', ttlMs: 5000, value: ['name', 'Ada'] },
            { key: 'queue', kind: 'list', ttlMs: -1, value: ['first'] },
        ])
        expect(invoke).toHaveBeenCalledWith('redis_export_keyspace', {
            target: { ...session.target, password: 'secret' },
            pattern: null,
            maxKeys: 25,
        })
    })
})
