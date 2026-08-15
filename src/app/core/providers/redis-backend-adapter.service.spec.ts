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

    it('reuses the runtime-only password for subsequent native operations', async () => {
        invoke.mockResolvedValue({ key: 'greeting', kind: 'string', ttl_ms: -1, value: 'hello' })

        await service.getKey(session, 'greeting')

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
})
