import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { SqlitePersistedSession } from '@quarrydb/shared/session'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SqliteProviderService } from './sqlite-provider.service'

describe('SqliteProviderService', () => {
    const workspaceStore = {
        openDatabase: vi.fn(),
        openSampleDatabase: vi.fn(),
        openRecentItem: vi.fn(),
        restoreWorkspace: vi.fn(),
        setActiveTab: vi.fn(),
        selectTable: vi.fn(),
    }
    const variableValuesSet = vi.fn()
    const pipelineStore = {
        openForTable: vi.fn(),
        restoreSteps: vi.fn(),
        variableValues: { set: variableValuesSet },
    }
    const db = {
        loadSchema: vi.fn(),
    }

    let provider: SqliteProviderService

    beforeEach(() => {
        workspaceStore.openDatabase.mockReset()
        workspaceStore.openSampleDatabase.mockReset()
        workspaceStore.openRecentItem.mockReset()
        workspaceStore.restoreWorkspace.mockReset()
        workspaceStore.setActiveTab.mockReset()
        workspaceStore.selectTable.mockReset()
        pipelineStore.openForTable.mockReset()
        pipelineStore.restoreSteps.mockReset()
        variableValuesSet.mockReset()
        db.loadSchema.mockReset()

        provider = Object.assign(Object.create(SqliteProviderService.prototype), {
            workspaceStore,
            pipelineStore,
            db,
        }) as SqliteProviderService
    })

    it('opens the default SQLite file picker from home', async () => {
        await provider.openFromHome()

        expect(workspaceStore.openDatabase).toHaveBeenCalledOnce()
    })

    it('opens the sample SQLite database flow', async () => {
        await provider.openSample()

        expect(workspaceStore.openSampleDatabase).toHaveBeenCalledOnce()
    })

    it('reopens a SQLite recent item', async () => {
        const item: RecentItem = {
            id: 'sqlite:/tmp/app.db',
            providerId: 'sqlite',
            label: 'app.db',
            subtitle: '/tmp/app.db',
            openedAt: 1,
            resource: { path: '/tmp/app.db' },
        }

        await provider.openRecentItem(item)

        expect(workspaceStore.openRecentItem).toHaveBeenCalledWith(item)
    })

    it('restores the provider-aware SQLite session shape', async () => {
        const session: SqlitePersistedSession = {
            version: 1,
            providerId: 'sqlite',
            savedAt: 1234,
            workspace: {
                name: 'app.db',
                databases: [{ path: '/tmp/app.db', alias: 'main' }],
                activeTab: 'edit',
                selectedTable: { schemaAlias: 'main', tableName: 'users' },
            },
            pipeline: {
                source: {
                    path: '/tmp/app.db',
                    alias: 'main',
                    tableName: 'users',
                    columns: ['id', 'name'],
                },
                steps: [{ id: 's1', type: 'WHERE', expression: 'id > 1' }],
                variableValues: { limit: '10' },
            },
        }
        db.loadSchema.mockResolvedValue({ path: '/tmp/app.db', alias: 'main', tables: [], views: [], triggers: [] })

        await provider.restoreSession(session)

        expect(workspaceStore.restoreWorkspace).toHaveBeenCalledWith(
            [{ path: '/tmp/app.db', alias: 'main', tables: [], views: [], triggers: [] }],
            'app.db',
        )
        expect(workspaceStore.setActiveTab).toHaveBeenCalledWith('edit')
        expect(workspaceStore.selectTable).toHaveBeenCalledWith('main', 'users')
        expect(pipelineStore.openForTable).toHaveBeenCalledWith('/tmp/app.db', 'main', 'users', ['id', 'name'])
        expect(pipelineStore.restoreSteps).toHaveBeenCalledWith([{ id: 's1', type: 'WHERE', expression: 'id > 1' }])
        expect(variableValuesSet).toHaveBeenCalledWith({ limit: '10' })
    })

    it('throws when SQLite schemas cannot be reloaded during restore', async () => {
        db.loadSchema.mockRejectedValue(new Error('missing'))

        await expect(
            provider.restoreSession({
                version: 1,
                providerId: 'sqlite',
                savedAt: 1,
                workspace: {
                    name: 'gone.db',
                    databases: [{ path: '/tmp/gone.db', alias: 'main' }],
                },
                pipeline: {
                    source: null,
                    steps: [],
                    variableValues: {},
                },
            }),
        ).rejects.toThrow('Failed to restore SQLite session')
    })
})
