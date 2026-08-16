import { signal } from '@angular/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MysqlProviderService } from './mysql-provider.service'

describe('MysqlProviderService', () => {
    const capabilities = [
        'recent_items',
        'server_connection',
        'relational_schema_browser',
        'sql_query_runner',
        'visual_sql_pipeline',
    ] as const
    const launchAction = {
        id: 'mysql' as const,
        name: 'MySQL',
        description: 'Connect to a MySQL server, browse schemas, edit rows, and build visual queries.',
        icon: 'mysql-server' as const,
        openLabel: 'Connect to MySQL' as const,
        openHint: 'Local and remote MySQL servers are supported through saved connection profiles.',
    }
    const homeLaunchAction = {
        ...launchAction,
        status: 'available' as const,
        badgeLabel: 'MySQL' as const,
    }
    const profiles = {
        load: vi.fn(),
        find: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
        remove: vi.fn(),
    }
    const secrets = {
        get: vi.fn(),
        load: vi.fn(),
        set: vi.fn(),
        remember: vi.fn(),
        has: vi.fn(),
        remove: vi.fn(),
        forget: vi.fn(),
    }
    const errorSet = vi.fn()
    const loadingSet = vi.fn()
    const host = {
        error: { set: errorSet },
        isLoading: { set: loadingSet },
        setWorkspaceOpen: vi.fn(),
    }
    const backend = {
        connect: vi.fn(),
        forgetConnection: vi.fn(),
        listSchemas: vi.fn(),
    }
    const workspace = {
        openWorkspace: vi.fn(),
        clear: vi.fn(),
        selectedTable: vi.fn(),
        activeTab: vi.fn(),
    }
    const recentItems = {
        add: vi.fn(),
        createMysqlItem: vi.fn(),
        remove: vi.fn(),
    }
    const pipeline = {
        clear: vi.fn(),
        source: vi.fn(),
        steps: vi.fn(),
        variableValues: vi.fn(),
        openForTable: vi.fn(),
        restoreState: vi.fn(),
    }

    let service: MysqlProviderService

    beforeEach(() => {
        profiles.load.mockReset()
        profiles.find.mockReset()
        profiles.create.mockReset()
        profiles.upsert.mockReset()
        profiles.remove.mockReset()
        secrets.get.mockReset()
        secrets.load.mockReset()
        secrets.set.mockReset()
        secrets.remember.mockReset()
        secrets.remember.mockResolvedValue(true)
        secrets.has.mockReset()
        secrets.remove.mockReset()
        secrets.forget.mockReset()
        errorSet.mockReset()
        loadingSet.mockReset()
        backend.connect.mockReset()
        backend.forgetConnection.mockReset()
        backend.listSchemas.mockReset()
        recentItems.add.mockReset()
        recentItems.createMysqlItem.mockReset()
        recentItems.remove.mockReset()
        host.setWorkspaceOpen.mockReset()
        workspace.openWorkspace.mockReset()
        workspace.clear.mockReset()
        workspace.selectedTable.mockReset()
        workspace.activeTab.mockReset()
        pipeline.clear.mockReset()
        pipeline.source.mockReset()
        pipeline.steps.mockReset()
        pipeline.variableValues.mockReset()
        pipeline.openForTable.mockReset()
        pipeline.restoreState.mockReset()
        pipeline.source.mockReturnValue(null)
        pipeline.steps.mockReturnValue([])
        pipeline.variableValues.mockReturnValue({})

        service = Object.assign(Object.create(MysqlProviderService.prototype), {
            id: 'mysql',
            kind: 'relational',
            capabilities,
            launchAction,
            availability: {
                canOpenFromHome: true,
                canOpenRecentItems: true,
                canRestoreSession: true,
            },
            backend,
            host,
            homeLaunchAction,
            profiles,
            secrets,
            recentItems,
            workspace,
            pipeline,
            workspaceDraft: signal(null),
            connectionSession: signal(null),
            schemaSummaries: signal(null),
            schemaBootstrapError: signal(null),
            connectPassword: signal(''),
            secretStorageWarning: signal(null),
        }) as MysqlProviderService
    })

    it('exposes a registered MySQL provider definition', () => {
        expect(service.id).toBe('mysql')
        expect(service.kind).toBe('relational')
        expect(service.capabilities).toEqual(capabilities)
        expect(service.launchAction).toEqual(launchAction)
        expect(service.availability).toEqual({
            canOpenFromHome: true,
            canOpenRecentItems: true,
            canRestoreSession: true,
        })
    })

    it('exposes the MySQL home launcher action', () => {
        expect(service.homeLaunchAction).toEqual(homeLaunchAction)
    })

    it('builds a sensible default connection draft', () => {
        expect(service.createDraft()).toEqual({
            name: '',
            host: 'localhost',
            port: 3306,
            username: '',
            password: '',
            rememberPassword: false,
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
            rememberPassword: true,
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
            rememberPassword: true,
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
                rememberPassword: true,
                color: undefined,
                sslMode: 'required',
            },
            1,
        )
        expect(profiles.upsert).toHaveBeenCalledWith(created)
        expect(secrets.set).toHaveBeenCalledWith('mysql-1', ' secret ')
        expect(secrets.remember).toHaveBeenCalledWith('mysql-1', ' secret ')
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
        service.connectionSession.set({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
            },
            source: 'saved_profile',
            connectedAt: 1234,
        })

        service.removeProfile('mysql-1')

        expect(profiles.remove).toHaveBeenCalledWith('mysql-1')
        expect(backend.forgetConnection).toHaveBeenCalledWith('mysql-1')
        expect(recentItems.remove).toHaveBeenCalledWith('mysql:mysql-1')
        expect(service.workspaceDraft()).toBeNull()
        expect(service.connectionSession()).toBeNull()
        expect(service.schemaSummaries()).toBeNull()
        expect(workspace.clear).toHaveBeenCalledOnce()
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
        secrets.get.mockReturnValue('secret')

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
        expect(service.connectPassword()).toBe('secret')
    })

    it('returns false when selecting an unknown saved profile', () => {
        profiles.find.mockReturnValue(null)

        expect(service.selectProfile('missing')).toBe(false)
        expect(service.workspaceDraft()).toBeNull()
    })

    it('prepares a MySQL recent item into the pending workspace draft', () => {
        expect(
            service.prepareRecentItem({
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
        service.connectPassword.set('secret')

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

    it('returns null when a draft exists but no password is available', () => {
        profiles.find.mockReturnValue({
            id: 'mysql-1',
            name: 'Analytics',
            host: 'db.internal',
            port: 3306,
            username: 'quarry',
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

        expect(service.buildConnectRequestFromWorkspaceDraft()).toBeNull()
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
        service.connectPassword.set('secret')

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
        expect(service.schemaBootstrapError()).toBeNull()
        expect(workspace.openWorkspace).toHaveBeenCalledWith(
            {
                target: {
                    connectionId: 'mysql-1',
                    connectionName: 'Analytics',
                    host: 'db.internal',
                    port: 3306,
                    defaultDatabase: 'warehouse',
                },
                source: 'saved_profile',
                connectedAt: 1234,
            },
            [
                { name: 'warehouse', isDefault: true },
                { name: 'analytics', isDefault: false },
            ],
            {
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
            },
        )
        expect(loadingSet).toHaveBeenNthCalledWith(1, true)
        expect(loadingSet).toHaveBeenNthCalledWith(2, false)
        expect(errorSet).toHaveBeenCalledWith(null)
    })

    it('prepares a recent item without auto-connecting when no password is available', async () => {
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

        await service.openRecentItem(item)

        expect(backend.connect).not.toHaveBeenCalled()
        expect(errorSet).toHaveBeenCalledWith('Enter the MySQL password to reconnect to this saved profile.')
    })

    it('builds an active persisted session from the opened MySQL workspace', () => {
        service.connectionSession.set({
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
        workspace.selectedTable.mockReturnValue({ schemaName: 'warehouse', tableName: 'orders' })
        workspace.activeTab.mockReturnValue('query')

        expect(service.buildActiveSession(999)).toEqual({
            version: 1,
            providerId: 'mysql',
            savedAt: 999,
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
        })
    })

    it('persists the MySQL pipeline workspace view independently of SQLite tabs', () => {
        service.connectionSession.set({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
            },
            source: 'saved_profile',
            connectedAt: 1234,
        })
        workspace.selectedTable.mockReturnValue(null)
        workspace.activeTab.mockReturnValue('pipeline')

        expect(service.buildActiveSession(999)?.workspace.activeTab).toBe('pipeline')
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

    it('keeps the provisional session and falls back to the default schema when schema bootstrap fails', async () => {
        profiles.find.mockReturnValue({
            id: 'mysql-1',
            name: 'Analytics',
            host: 'db.internal',
            port: 3306,
            username: 'quarry',
            defaultDatabase: 'warehouse',
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
        backend.listSchemas.mockRejectedValue(new Error('MySQL backend adapter is not implemented yet'))
        service.schemaSummaries.set([{ name: 'stale', isDefault: false }])
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
        service.connectPassword.set('secret')

        await service.connectWorkspaceDraft()

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
        expect(service.schemaSummaries()).toEqual([{ name: 'warehouse', isDefault: true }])
        expect(service.schemaBootstrapError()).toBe('MySQL backend adapter is not implemented yet')
        expect(workspace.openWorkspace).toHaveBeenCalledWith(
            {
                target: {
                    connectionId: 'mysql-1',
                    connectionName: 'Analytics',
                    host: 'db.internal',
                    port: 3306,
                    defaultDatabase: 'warehouse',
                },
                source: 'saved_profile',
                connectedAt: 1234,
            },
            [{ name: 'warehouse', isDefault: true }],
            {
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
            },
        )
    })

    it('stores a runtime password for the current draft', () => {
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

        service.setConnectPassword('secret')

        expect(service.connectPassword()).toBe('secret')
        expect(secrets.set).toHaveBeenCalledWith('mysql-1', 'secret')
    })

    it('reports actionable errors from shell entrypoints', async () => {
        backend.listSchemas.mockRejectedValue(new Error('MySQL backend adapter is not implemented yet'))
        profiles.find.mockReturnValue({
            id: 'mysql-1',
            name: 'Analytics',
            host: 'db.internal',
            port: 3306,
            username: 'quarry',
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
        await expect(service.openSample()).rejects.toThrow('A MySQL sample database is not bundled')
        await service.openRecentItem({
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
        })
        await service.restoreSession({
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
        })

        expect(errorSet).toHaveBeenCalledWith('MySQL connect target is not ready yet')
        expect(errorSet).toHaveBeenCalledWith(
            'A MySQL sample database is not bundled. Configure a saved server profile instead.',
        )
        expect(errorSet).toHaveBeenCalledWith('Enter the MySQL password to reconnect to this saved profile.')
        expect(errorSet).toHaveBeenCalledWith(
            'MySQL connection restored. Re-enter the password below to reopen the workspace.',
        )
        expect(service.connectionSession()).toBeNull()
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
        expect(service.schemaBootstrapError()).toBeNull()
        expect(backend.forgetConnection).toHaveBeenCalledWith('mysql-1')
    })
})
