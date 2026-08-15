import { describe, expect, it } from 'vitest'
import { isLegacyPersistedSession, isPersistedSession } from './session-validation'

const pipeline = {
    source: null,
    steps: [{ id: 'where-1', type: 'WHERE' as const, expression: 'id > 1' }],
    variableValues: {},
}

describe('session validation', () => {
    it('accepts valid SQLite, MySQL, and Redis sessions', () => {
        expect(
            isPersistedSession({
                version: 1,
                providerId: 'sqlite',
                savedAt: 1,
                workspace: {
                    name: 'Demo',
                    databases: [{ path: '/tmp/demo.db', alias: 'main' }],
                    selectedTable: { schemaAlias: 'main', tableName: 'users' },
                    activeTab: 'browse',
                },
                pipeline,
            }),
        ).toBe(true)

        expect(
            isPersistedSession({
                version: 1,
                providerId: 'mysql',
                savedAt: 1,
                workspace: {
                    connectionId: 'mysql-1',
                    connectionName: 'Analytics',
                    host: '127.0.0.1',
                    port: 3306,
                    defaultDatabase: 'warehouse',
                    selectedTable: { schemaName: 'warehouse', tableName: 'users' },
                    activeTab: 'pipeline',
                },
                pipeline: {
                    ...pipeline,
                    source: { connectionId: 'mysql-1', schemaName: 'warehouse', tableName: 'users', columns: ['id'] },
                },
            }),
        ).toBe(true)

        expect(
            isPersistedSession({
                version: 1,
                providerId: 'redis',
                savedAt: 1,
                workspace: {
                    connectionId: 'redis-1',
                    connectionName: 'Cache',
                    host: 'localhost',
                    port: 6379,
                    database: 0,
                    tls: false,
                    selectedKey: 'users:1',
                    keyPattern: 'users:*',
                    activeTab: 'keys',
                },
            }),
        ).toBe(true)
    })

    it('rejects malformed nested provider state instead of trusting the top-level shape', () => {
        expect(
            isPersistedSession({
                version: 1,
                providerId: 'sqlite',
                savedAt: 1,
                workspace: { name: 'Demo', databases: [{ path: '/tmp/demo.db', alias: '' }] },
                pipeline,
            }),
        ).toBe(false)

        expect(
            isPersistedSession({
                version: 1,
                providerId: 'mysql',
                savedAt: 1,
                workspace: {
                    connectionId: 'mysql-1',
                    connectionName: 'Analytics',
                    host: 'localhost',
                    port: 0,
                },
                pipeline: { ...pipeline, steps: [{ id: 'broken', type: 'UNKNOWN' }] },
            }),
        ).toBe(false)

        expect(
            isPersistedSession({
                version: 1,
                providerId: 'redis',
                savedAt: 1,
                workspace: {
                    connectionId: 'redis-1',
                    connectionName: 'Cache',
                    host: 'localhost',
                    port: 6379,
                    database: 256,
                    tls: false,
                },
            }),
        ).toBe(false)
    })

    it('accepts the legacy SQLite shape only when its nested data is valid', () => {
        expect(
            isLegacyPersistedSession({
                version: 1,
                databases: [{ path: '/tmp/demo.db', alias: 'main' }],
                activeTab: 'browse',
                selectedTable: null,
                pipeline,
            }),
        ).toBe(true)

        expect(
            isLegacyPersistedSession({
                version: 1,
                databases: [{ path: '/tmp/demo.db', alias: 'main' }],
                activeTab: 'browse',
                selectedTable: null,
                pipeline: { ...pipeline, variableValues: { limit: 3 } },
            }),
        ).toBe(false)
    })
})
