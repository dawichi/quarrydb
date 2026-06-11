import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MysqlProviderService } from './mysql-provider.service'

describe('MysqlProviderService', () => {
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
        create: vi.fn(),
        upsert: vi.fn(),
        remove: vi.fn(),
    }
    const recentItems = {
        add: vi.fn(),
        createMysqlItem: vi.fn(),
        remove: vi.fn(),
    }

    let service: MysqlProviderService

    beforeEach(() => {
        profiles.load.mockReset()
        profiles.create.mockReset()
        profiles.upsert.mockReset()
        profiles.remove.mockReset()
        recentItems.add.mockReset()
        recentItems.createMysqlItem.mockReset()
        recentItems.remove.mockReset()

        service = Object.assign(Object.create(MysqlProviderService.prototype), {
            homeLaunchAction,
            profiles,
            recentItems,
        }) as MysqlProviderService
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
            defaultDatabase: ' warehouse ',
            sslMode: 'required' as const,
        }
        const created = {
            id: 'mysql-1',
            name: 'Analytics',
            host: 'db.internal',
            port: 3306,
            username: 'quarry',
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
                defaultDatabase: 'warehouse',
                color: undefined,
                sslMode: 'required',
            },
            1,
        )
        expect(profiles.upsert).toHaveBeenCalledWith(created)
        expect(recentItems.createMysqlItem).toHaveBeenCalledWith(created, 1)
        expect(recentItems.add).toHaveBeenCalledWith({ id: 'mysql:mysql-1' })
    })

    it('removes a saved profile by id', () => {
        service.removeProfile('mysql-1')

        expect(profiles.remove).toHaveBeenCalledWith('mysql-1')
        expect(recentItems.remove).toHaveBeenCalledWith('mysql:mysql-1')
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
})
