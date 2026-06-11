import { describe, expect, it } from 'vitest'
import {
    createMysqlWorkspaceDraft,
    createMysqlWorkspaceDraftFromRecentItem,
    createMysqlWorkspaceDraftFromSession,
} from './mysql-workspace-draft'

describe('mysql workspace draft helpers', () => {
    it('builds a draft from a connection target', () => {
        expect(
            createMysqlWorkspaceDraft(
                {
                    connectionId: 'mysql-1',
                    connectionName: 'Analytics',
                    host: 'db.internal',
                    port: 3306,
                    defaultDatabase: 'warehouse',
                },
                'saved_profile',
            ),
        ).toEqual({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
            source: 'saved_profile',
            selectedTable: null,
            activeTab: 'browse',
        })
    })

    it('builds a draft from a recent item', () => {
        expect(
            createMysqlWorkspaceDraftFromRecentItem({
                id: 'mysql:mysql-1',
                providerId: 'mysql',
                label: 'Analytics',
                openedAt: 1,
                resource: {
                    connectionId: 'mysql-1',
                    connectionName: 'Analytics',
                    host: 'db.internal',
                    port: 3306,
                },
            }),
        ).toEqual({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
            },
            source: 'recent_item',
            selectedTable: null,
            activeTab: 'browse',
        })
    })

    it('builds a draft from a persisted session', () => {
        expect(
            createMysqlWorkspaceDraftFromSession({
                version: 1,
                providerId: 'mysql',
                savedAt: 1,
                workspace: {
                    connectionId: 'mysql-1',
                    connectionName: 'Analytics',
                    host: 'db.internal',
                    port: 3306,
                    defaultDatabase: 'warehouse',
                    selectedTable: { schemaName: 'warehouse', tableName: 'orders' },
                    activeTab: 'query',
                },
                pipeline: {
                    source: null,
                    steps: [],
                    variableValues: {},
                },
            }),
        ).toEqual({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
            source: 'session_restore',
            selectedTable: { schemaName: 'warehouse', tableName: 'orders' },
            activeTab: 'query',
        })
    })
})
