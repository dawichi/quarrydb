import { signal } from '@angular/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MysqlProviderService } from './mysql-provider.service'

describe('MysqlProviderService', () => {
    const capabilities = ['recent_items', 'server_connection', 'relational_schema_browser', 'sql_query_runner'] as const
    const launchAction = {
        id: 'mysql' as const,
        name: 'MySQL',
        description: 'Connect to a saved MySQL server profile once the second provider lands.',
        icon: 'mysql-server' as const,
        openLabel: 'Connect to MySQL' as const,
        openHint: 'Saved profile flow is in progress.',
    }
    const homeLaunchAction = {
        id: 'mysql-preview' as const,
        status: 'planned' as const,
        name: 'MySQL',
        description: 'Connect to a saved MySQL server profile once the second provider lands.',
        icon: 'mysql-server' as const,
        openLabel: 'Connect to MySQL' as const,
        openHint: 'Planned provider: saved connections, browse, and raw SQL.',
        badgeLabel: 'Planned' as const,
        availabilityNote: 'MySQL support is not shipped yet.',
    }
    const profiles = {
        load: vi.fn(),
        find: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
        remove: vi.fn(),
    }
    const errorSet = vi.fn()
    const loadingSet = vi.fn()
    const host = {
        error: { set: errorSet },
        isLoading: { set: loadingSet },
    }
    const backend = {
        connect: vi.fn(),
        listSchemas: vi.fn(),
    }
    const recentItems = {
        add: vi.fn(),
        createMysqlItem: vi.fn(),
        remove: vi.fn(),
    }

    let service: MysqlProviderService

    beforeEach(() => {
        profiles.load.mockReset()
        profiles.find.mockReset()
        profiles.create.mockReset()
        profiles.upsert.mockReset()
        profiles.remove.mockReset()
        errorSet.mockReset()
        loadingSet.mockReset()
        backend.connect.mockReset()
        backend.listSchemas.mockReset()
        recentItems.add.mockReset()
        recentItems.createMysqlItem.mockReset()
        recentItems.remove.mockReset()

        service = Object.assign(Object.create(MysqlProviderService.prototype), {
            id: 'mysql',
            kind: 'relational',
            capabilities,
            launchAction,
            availability: {
                canOpenFromHome: false,
                canOpenRecentItems: true,
                canRestoreSession: false,
                unavailableMessage: 'MySQL preview currently supports connection testing and schema listing only.',
            },
            backend,
            host,
            homeLaunchAction,
            profiles,
            recentItems,
            workspaceDraft: signal(null),
            connectionSession: signal(null),
            schemaSummaries: signal(null),
        }) as MysqlProviderService
    })

    it('exposes a registered MySQL provider definition', () => {
        expect(service.id).toBe('mysql')
        expect(service.kind).toBe('relational')
        expect(service.capabilities).toEqual(capabilities)
        expect(service.launchAction).toEqual(launchAction)
        expect(service.availability).toEqual({
            canOpenFromHome: false,
            canOpenRecentItems: true,
            canRestoreSession: false,
            unavailableMessage: 'MySQL preview currently supports connection testing and schema listing only.',
        })
    })

    it('exposes a planned home launcher action', () => {
        expect(service.homeLaunchAction).toEqual(homeLaunchAction)
    })

    it('builds a sensible default connection draft', () => {
        expect(service.createDraft()).toEqual({
            name: '',
            host: 'localhost',
            port: 3306,
            username: '',
            password: '',
            sslMode: 'preferred',
        })
    })

    it('loads saved profiles from provider-owned storage', () => {
        profiles.load.mockReturnValue([{ id: 'a', name: 'Main' }])

        expect(service.loadProfiles()).toEqual([{ id: 'a', name: 'Main' }])
    })

    it('saves a trimmed draft through profile storage', () => {
        const draft = {
            name: ' Analytics ',
            host: ' db.internal ',
            port: 3306,
            username: ' quarry ',
            password: ' secret ',
            defaultDatabase: ' warehouse ',
            sslMode: 'required' as const,
        }
        const created = {
            id: 'mysql-1',
            name: 'Analytics',
            host: 'db.internal',
            port: 3306,
            username: 'quarry',
            password: 'secret',
            defaultDatabase: 'warehouse',
            sslMode: 'required' as const,
            createdAt: 1,
            updatedAt: 1,
        }
        profiles.create.mockReturnValue(created)
        recentItems.createMysqlItem.mockReturnValue({ id: 'mysql:mysql-1' })

        expect(service.saveDraft(draft, 1)).toEqual(created)
        expect(profiles.create).toHaveBeenCalledWith(
            {
                name: 'Analytics',
                host: 'db.internal',
                port: 3306,
                username: 'quarry',
                password: 'secret',
                defaultDatabase: 'warehouse',
                color: undefined,
                sslMode: 'required',
            },
            1,
        )
        expect(profiles.upsert).toHaveBeenCalledWith(created)
        expect(recentItems.createMysqlItem).toHaveBeenCalledWith(created, 1)
        expect(recentItems.add).toHaveBeenCalledWith({ id: 'mysql:mysql-1' })
        expect(service.workspaceDraft()).toEqual({
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

    it('removes a saved profile by id', () => {
        service.workspaceDraft.set({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
            },
            source: 'saved_profile',
            selectedTable: null,
            activeTab: 'browse',
        })

        service.removeProfile('mysql-1')

        expect(profiles.remove).toHaveBeenCalledWith('mysql-1')
        expect(recentItems.remove).toHaveBeenCalledWith('mysql:mysql-1')
        expect(service.workspaceDraft()).toBeNull()
        expect(service.connectionSession()).toBeNull()
        expect(service.schemaSummaries()).toBeNull()
    })

    it('formats the subtitle using host, port, and optional database', () => {
        expect(
            service.formatProfileSubtitle({
                id: 'a',
                name: 'Main',
                host: 'localhost',
                port: 3306,
                username: 'root',
                defaultDatabase: 'warehouse',
                createdAt: 1,
                updatedAt: 1,
            }),
        ).toBe('localhost:3306 · warehouse')

        expect(
            service.formatProfileSubtitle({
                id: 'b',
                name: 'Replica',
                host: 'replica.internal',
                port: 3307,
                username: 'reader',
                createdAt: 1,
                updatedAt: 1,
            }),
        ).toBe('replica.internal:3307')
    })

    it('builds a provider-aware MySQL persisted session shape', () => {
        expect(
            service.buildPersistedSession(
                {
                    id: 'mysql-1',
                    name: 'Analytics',
                    host: 'db.internal',
                    port: 3306,
                    username: 'quarry',
                    password: 'secret',
                    defaultDatabase: 'warehouse',
                    createdAt: 1,
                    updatedAt: 1,
                },
                1234,
                { schemaName: 'warehouse', tableName: 'orders' },
            ),
        ).toEqual({
            version: 1,
            providerId: 'mysql',
            savedAt: 1234,
            workspace: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
                defaultDatabase: 'warehouse',
                selectedTable: { schemaName: 'warehouse', tableName: 'orders' },
                activeTab: 'browse',
            },
            pipeline: {
                source: null,
                steps: [],
                variableValues: {},
            },
        })
    })

    it('selects a saved profile into the pending workspace draft', () => {
        profiles.find.mockReturnValue({
            id: 'mysql-1',
            name: 'Analytics',
            host: 'db.internal',
            port: 3306,
            username: 'quarry',
            password: 'secret',
            defaultDatabase: 'warehouse',
            createdAt: 1,
            updatedAt: 1,
        })

        expect(service.selectProfile('mysql-1')).toBe(true)
        expect(service.workspaceDraft()).toEqual({
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

    it('returns false when selecting an unknown saved profile', () => {
        profiles.find.mockReturnValue(null)

        expect(service.selectProfile('missing')).toBe(false)
        expect(service.workspaceDraft()).toBeNull()
    })

    it('previews a MySQL recent item into the pending workspace draft', () => {
        expect(
            service.previewRecentItem({
                id: 'mysql:mysql-1',
                providerId: 'mysql',
                label: 'Analytics',
                openedAt: 1,
                resource: {
                    connectionId: 'mysql-1',
                    connectionName: 'Analytics',
                    host: 'db.internal',
                    port: 3306,
                    defaultDatabase: 'warehouse',
                },
            }),
        ).toBe(true)

        expect(service.workspaceDraft()).toEqual({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
            source: 'recent_item',
            selectedTable: null,
            activeTab: 'browse',
        })
    })

    it('builds a backend-facing connect request from the pending workspace draft', () => {
        profiles.find.mockReturnValue({
            id: 'mysql-1',
            name: 'Analytics',
            host: 'db.internal',
            port: 3306,
            username: 'quarry',
            password: 'secret',
            defaultDatabase: 'warehouse',
            sslMode: 'required',
            createdAt: 1,
            updatedAt: 1,
        })
        service.workspaceDraft.set({
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

        expect(service.buildConnectRequestFromWorkspaceDraft()).toEqual({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
            username: 'quarry',
            password: 'secret',
            sslMode: 'required',
            source: 'saved_profile',
        })
    })

    it('returns null when the pending workspace draft has no matching saved profile', () => {
        profiles.find.mockReturnValue(null)
        service.workspaceDraft.set({
            target: {
                connectionId: 'missing',
                connectionName: 'Missing',
                host: 'db.internal',
                port: 3306,
            },
            source: 'recent_item',
            selectedTable: null,
            activeTab: 'browse',
        })

        expect(service.buildConnectRequestFromWorkspaceDraft()).toBeNull()
    })

    it('routes a pending workspace draft through the backend adapter', async () => {
        profiles.find.mockReturnValue({
            id: 'mysql-1',
            name: 'Analytics',
            host: 'db.internal',
            port: 3306,
            username: 'quarry',
            password: 'secret',
            defaultDatabase: 'warehouse',
            sslMode: 'required',
            createdAt: 1,
            updatedAt: 1,
        })
        backend.connect.mockResolvedValue({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
            source: 'saved_profile',
            connectedAt: 1234,
        })
        backend.listSchemas.mockResolvedValue([
            { name: 'warehouse', isDefault: true },
            { name: 'analytics', isDefault: false },
        ])
        service.workspaceDraft.set({
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

        await service.connectWorkspaceDraft()

        expect(backend.connect).toHaveBeenCalledWith({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
            username: 'quarry',
            password: 'secret',
            sslMode: 'required',
            source: 'saved_profile',
        })
        expect(service.connectionSession()).toEqual({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
            source: 'saved_profile',
            connectedAt: 1234,
        })
        expect(service.schemaSummaries()).toEqual([
            { name: 'warehouse', isDefault: true },
            { name: 'analytics', isDefault: false },
        ])
        expect(loadingSet).toHaveBeenNthCalledWith(1, true)
        expect(loadingSet).toHaveBeenNthCalledWith(2, false)
        expect(errorSet).toHaveBeenCalledWith(null)
    })

    it('fails when the pending workspace draft cannot be resolved into a connect request', async () => {
        profiles.find.mockReturnValue(null)
        service.workspaceDraft.set({
            target: {
                connectionId: 'missing',
                connectionName: 'Missing',
                host: 'db.internal',
                port: 3306,
            },
            source: 'recent_item',
            selectedTable: null,
            activeTab: 'browse',
        })

        await expect(service.connectWorkspaceDraft()).rejects.toThrow('MySQL connect target is not ready yet')
        expect(errorSet).toHaveBeenCalledWith('MySQL connect target is not ready yet')
    })

    it('keeps the provisional session when schema bootstrap fails and clears schema summaries', async () => {
        profiles.find.mockReturnValue({
            id: 'mysql-1',
            name: 'Analytics',
            host: 'db.internal',
            port: 3306,
            username: 'quarry',
            password: 'secret',
            createdAt: 1,
            updatedAt: 1,
        })
        backend.connect.mockResolvedValue({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
            },
            source: 'saved_profile',
            connectedAt: 1234,
        })
        backend.listSchemas.mockRejectedValue(new Error('MySQL backend adapter is not implemented yet'))
        service.schemaSummaries.set([{ name: 'stale', isDefault: false }])
        service.workspaceDraft.set({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
            },
            source: 'saved_profile',
            selectedTable: null,
            activeTab: 'browse',
        })

        await expect(service.connectWorkspaceDraft()).rejects.toThrow('MySQL backend adapter is not implemented yet')

        expect(service.connectionSession()).toEqual({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
            },
            source: 'saved_profile',
            connectedAt: 1234,
        })
        expect(service.schemaSummaries()).toBeNull()
        expect(errorSet).toHaveBeenCalledWith('MySQL backend adapter is not implemented yet')
    })

    it('fails shell entrypoints with a consistent unavailable error', async () => {
        backend.listSchemas.mockRejectedValue(new Error('MySQL backend adapter is not implemented yet'))
        profiles.find.mockReturnValue({
            id: 'mysql-1',
            name: 'Analytics',
            host: 'db.internal',
            port: 3306,
            username: 'quarry',
            password: 'secret',
            defaultDatabase: 'warehouse',
            createdAt: 1,
            updatedAt: 1,
        })
        backend.connect.mockImplementation(async (request) => ({
            target: request.target,
            source: request.source,
            connectedAt: 1234,
        }))

        await expect(service.openFromHome()).rejects.toThrow('MySQL connect target is not ready yet')
        await expect(service.openSample()).rejects.toThrow('MySQL provider is not available yet')
        await expect(
            service.openRecentItem({
                id: 'mysql:mysql-1',
                providerId: 'mysql',
                label: 'Analytics',
                openedAt: 1,
                resource: {
                    connectionId: 'mysql-1',
                    connectionName: 'Analytics',
                    host: 'db.internal',
                    port: 3306,
                    defaultDatabase: 'warehouse',
                },
            }),
        ).rejects.toThrow('MySQL backend adapter is not implemented yet')
        await expect(
            service.restoreSession({
                version: 1,
                providerId: 'mysql',
                savedAt: 1,
                workspace: {
                    connectionId: 'mysql-1',
                    connectionName: 'Analytics',
                    host: 'db.internal',
                    port: 3306,
                    defaultDatabase: 'warehouse',
                    selectedTable: null,
                    activeTab: 'browse',
                },
                pipeline: {
                    source: null,
                    steps: [],
                    variableValues: {},
                },
            }),
        ).rejects.toThrow('MySQL backend adapter is not implemented yet')

        expect(errorSet).toHaveBeenCalledWith('MySQL connect target is not ready yet')
        expect(errorSet).toHaveBeenCalledWith('MySQL provider is not available yet')
        expect(errorSet).toHaveBeenCalledWith('MySQL backend adapter is not implemented yet')
        expect(service.connectionSession()).toEqual({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
            source: 'session_restore',
            connectedAt: 1234,
        })
        expect(service.schemaSummaries()).toBeNull()
        expect(service.workspaceDraft()).toEqual({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
            source: 'session_restore',
            selectedTable: null,
            activeTab: 'browse',
        })
    })

    it('clears the pending workspace draft explicitly', () => {
        service.workspaceDraft.set({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
            },
            source: 'saved_profile',
            selectedTable: null,
            activeTab: 'browse',
        })
        service.connectionSession.set({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
            },
            source: 'saved_profile',
            connectedAt: 1,
        })
        service.schemaSummaries.set([{ name: 'warehouse', isDefault: true }])

        service.clearWorkspaceDraft()

        expect(service.workspaceDraft()).toBeNull()
        expect(service.connectionSession()).toBeNull()
        expect(service.schemaSummaries()).toBeNull()
    })
})
