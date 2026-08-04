import type { PersistedSession } from '@quarrydb/shared/session'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderLaunchAction } from './provider-definition'
import { ProviderRegistryService } from './provider-registry.service'

describe('ProviderRegistryService', () => {
    const sqliteProvider = {
        id: 'sqlite' as const,
        kind: 'relational' as const,
        capabilities: [
            'recent_items',
            'relational_schema_browser',
            'sql_query_runner',
            'visual_sql_pipeline',
            'row_editor',
            'ddl_manager',
            'query_history',
            'export_results',
        ] as const,
        launchAction: {
            id: 'sqlite' as const,
            name: 'SQLite',
            description: 'Open a local SQLite file.',
            icon: 'sqlite-file',
            openLabel: 'Open SQLite file',
            openHint: 'Supports .db',
            sampleLabel: 'Create sample SQLite database',
        } satisfies ProviderLaunchAction,
        availability: {
            canOpenFromHome: true,
            canOpenRecentItems: true,
            canRestoreSession: true,
        },
        openFromHome: vi.fn(),
        openSample: vi.fn(),
        openRecentItem: vi.fn(),
        restoreSession: vi.fn(),
    }
    const mysqlProvider = {
        id: 'mysql' as const,
        kind: 'relational' as const,
        capabilities: ['recent_items', 'server_connection', 'relational_schema_browser', 'sql_query_runner'] as const,
        launchAction: {
            id: 'mysql' as const,
            name: 'MySQL',
            description: 'Connect to a saved MySQL server profile once the second provider lands.',
            icon: 'mysql-server' as const,
            openLabel: 'Connect to MySQL' as const,
            openHint: 'Saved profile flow is in progress.',
        },
        availability: {
            canOpenFromHome: false,
            canOpenRecentItems: true,
            canRestoreSession: true,
        },
        homeLaunchAction: {
            id: 'mysql-preview' as const,
            status: 'planned' as const,
            name: 'MySQL',
            description: 'Connect to a saved MySQL server profile once the second provider lands.',
            icon: 'mysql-server' as const,
            openLabel: 'Connect to MySQL' as const,
            openHint: 'Planned provider: saved connections, browse, and raw SQL.',
            badgeLabel: 'Planned' as const,
            availabilityNote: 'MySQL support is not shipped yet.',
        },
        openFromHome: vi.fn(),
        openSample: vi.fn(),
        openRecentItem: vi.fn(),
        restoreSession: vi.fn(),
    }

    let registry: ProviderRegistryService

    beforeEach(() => {
        sqliteProvider.openFromHome.mockReset()
        sqliteProvider.openSample.mockReset()
        sqliteProvider.openRecentItem.mockReset()
        sqliteProvider.restoreSession.mockReset()
        mysqlProvider.openFromHome.mockReset()
        mysqlProvider.openSample.mockReset()
        mysqlProvider.openRecentItem.mockReset()
        mysqlProvider.restoreSession.mockReset()

        registry = Object.assign(Object.create(ProviderRegistryService.prototype), {
            mysqlProvider,
            sqliteProvider,
        }) as ProviderRegistryService
    })

    it('exposes provider launch actions for the shell and welcome screen', () => {
        expect(registry.getLaunchActions()).toEqual([sqliteProvider.launchAction])
        expect(registry.getHomeLaunchActions()).toEqual([
            {
                ...sqliteProvider.launchAction,
                status: 'available',
                badgeLabel: 'SQLite',
            },
            {
                ...mysqlProvider.homeLaunchAction,
            },
        ])
        expect(registry.getProviderLabel('sqlite')).toBe('SQLite')
        expect(registry.getProviderDisplayAction('mysql')).toEqual(mysqlProvider.homeLaunchAction)
        expect(registry.canOpenRecentItem('sqlite')).toBe(true)
        expect(registry.canOpenRecentItem('mysql')).toBe(true)
        expect(registry.canRestoreSession('sqlite')).toBe(true)
        expect(registry.canRestoreSession('mysql')).toBe(true)
        expect(registry.getUnavailableMessage('sqlite')).toBeNull()
        expect(registry.getCapabilities('sqlite')).toEqual(sqliteProvider.capabilities)
        expect(registry.getCapabilities('mysql')).toEqual(mysqlProvider.capabilities)
        expect(registry.getUnavailableMessage('mysql')).toBeNull()
    })

    it('dispatches home open actions through the selected provider', async () => {
        await registry.openFromHome('sqlite')

        expect(sqliteProvider.openFromHome).toHaveBeenCalledOnce()
    })

    it('dispatches sample open actions through the selected provider', async () => {
        await registry.openSample('sqlite')

        expect(sqliteProvider.openSample).toHaveBeenCalledOnce()
    })

    it('dispatches recent items through their provider id', async () => {
        const item = {
            id: 'sqlite:/tmp/app.db',
            providerId: 'sqlite' as const,
            label: 'app.db',
            openedAt: 1,
            resource: { path: '/tmp/app.db' },
        }

        await registry.openRecentItem(item)

        expect(sqliteProvider.openRecentItem).toHaveBeenCalledWith(item)
    })

    it('dispatches persisted sessions through their provider id', async () => {
        const session: PersistedSession = {
            version: 1,
            providerId: 'sqlite',
            savedAt: 1,
            workspace: {
                name: 'app.db',
                databases: [{ path: '/tmp/app.db', alias: 'main' }],
            },
            pipeline: {
                source: null,
                steps: [],
                variableValues: {},
            },
        }

        await registry.restoreSession(session)

        expect(sqliteProvider.restoreSession).toHaveBeenCalledWith(session)
    })

    it('dispatches MySQL recent items through their provider id', async () => {
        const item = {
            id: 'mysql:mysql-1',
            providerId: 'mysql' as const,
            label: 'Analytics',
            openedAt: 1,
            resource: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
            },
        }

        await registry.openRecentItem(item)

        expect(mysqlProvider.openRecentItem).toHaveBeenCalledWith(item)
    })

    it('dispatches MySQL persisted sessions through their provider id', async () => {
        const session: PersistedSession = {
            version: 1,
            providerId: 'mysql',
            savedAt: 1,
            workspace: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
                selectedTable: null,
                activeTab: 'browse',
            },
            pipeline: {
                source: null,
                steps: [],
                variableValues: {},
            },
        }

        await registry.restoreSession(session)

        expect(mysqlProvider.restoreSession).toHaveBeenCalledWith(session)
    })
})
