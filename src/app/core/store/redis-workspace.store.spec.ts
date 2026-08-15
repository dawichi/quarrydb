import { signal } from '@angular/core'
import { describe, expect, it, vi } from 'vitest'
import type { RedisConnectionSession } from '../providers/redis-backend-adapter'
import { RedisWorkspaceStore } from './redis-workspace.store'

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((next) => {
        resolve = next
    })
    return { promise, resolve }
}

const session: RedisConnectionSession = {
    target: {
        connectionId: 'redis-test',
        connectionName: 'Test Redis',
        host: '127.0.0.1',
        port: 6379,
        database: 0,
        tls: false,
    },
    password: '',
    source: 'manual',
    connectedAt: 1,
    serverVersion: '7.2.0',
    databaseSize: 2,
}

describe('RedisWorkspaceStore', () => {
    it('keeps the newest pattern scan when an older scan finishes later', async () => {
        const first = deferred<{ cursor: number; keys: { key: string }[] }>()
        const second = deferred<{ cursor: number; keys: { key: string }[] }>()
        const backend = {
            scanKeys: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
        }
        const service = createStore(backend)

        service.setSession(session)
        service.setPattern('new:*')

        second.resolve({ cursor: 0, keys: [{ key: 'new:one' }] })
        await Promise.resolve()
        first.resolve({ cursor: 0, keys: [{ key: 'old:one' }] })
        await Promise.resolve()

        expect(service.keys()).toEqual(['new:one'])
        expect(service.pattern()).toBe('new:*')
        expect(service.isLoadingKeys()).toBe(false)
    })

    it('keeps the newest key details when selection changes during a request', async () => {
        const first = deferred<{ key: string; kind: string; ttlMs: number; value: unknown }>()
        const second = deferred<{ key: string; kind: string; ttlMs: number; value: unknown }>()
        const backend = {
            scanKeys: vi.fn().mockResolvedValue({ cursor: 0, keys: [] }),
            getKey: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
        }
        const service = createStore(backend)
        service.setSession(session)

        const oldSelection = service.selectKey('old')
        const newSelection = service.selectKey('new')

        second.resolve({ key: 'new', kind: 'string', ttlMs: 1000, value: 'new value' })
        await newSelection
        first.resolve({ key: 'old', kind: 'string', ttlMs: 1000, value: 'old value' })
        await oldSelection

        expect(service.selectedKey()).toBe('new')
        expect(service.keyDetails()).toEqual({ key: 'new', kind: 'string', ttlMs: 1000, value: 'new value' })
        expect(service.isLoadingKey()).toBe(false)
    })
})

function createStore(backend: {
    scanKeys: ReturnType<typeof vi.fn>
    getKey?: ReturnType<typeof vi.fn>
}): RedisWorkspaceStore {
    return Object.assign(Object.create(RedisWorkspaceStore.prototype), {
        backend,
        exportService: {},
        connectionSession: signal<RedisConnectionSession | null>(null),
        keys: signal<string[]>([]),
        selectedKey: signal<string | null>(null),
        keyDetails: signal(null),
        cursor: signal(0),
        pattern: signal('*'),
        isLoadingKeys: signal(false),
        isLoadingKey: signal(false),
        isMutating: signal(false),
        error: signal<string | null>(null),
        commandOutput: signal(null),
        keyScanRequestId: 0,
        keyDetailsRequestId: 0,
    }) as RedisWorkspaceStore
}
