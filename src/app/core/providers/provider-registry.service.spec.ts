import type { PersistedSession } from '@quarrydb/shared/session'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderLaunchAction } from './provider-definition'
import { ProviderRegistryService } from './provider-registry.service'

describe('ProviderRegistryService', () => {
    const sqliteProvider = {
        id: 'sqlite' as const,
        launchAction: {
            id: 'sqlite' as const,
            name: 'SQLite',
            description: 'Open a local SQLite file.',
            icon: 'sqlite-file',
            openLabel: 'Open SQLite file',
            openHint: 'Supports .db',
            sampleLabel: 'Create sample SQLite database',
        } satisfies ProviderLaunchAction,
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

        registry = Object.assign(Object.create(ProviderRegistryService.prototype), {
            sqliteProvider,
        }) as ProviderRegistryService
    })

    it('exposes provider launch actions for the welcome screen', () => {
        expect(registry.getLaunchActions()).toEqual([sqliteProvider.launchAction])
        expect(registry.getProviderLabel('sqlite')).toBe('SQLite')
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
})
