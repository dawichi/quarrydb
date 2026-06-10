import type { DatabaseSchema } from '@quarrydb/shared'
import type { SqlitePersistedSession } from '@quarrydb/shared/session'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionService } from './session.service'

let storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => {
        storage = new Map()
    },
})

describe('SessionService', () => {
    const variableValuesFn = vi.fn()
    const variableValuesSet = vi.fn()
    const workspaceStore = {
        schemas: vi.fn(),
        workspace: vi.fn(),
        activeTab: vi.fn(),
        selectedTable: vi.fn(),
        restoreWorkspace: vi.fn(),
        setActiveTab: vi.fn(),
        selectTable: vi.fn(),
    }
    const pipelineStore = {
        source: vi.fn(),
        steps: vi.fn(),
        openForTable: vi.fn(),
        restoreSteps: vi.fn(),
        variableValues: Object.assign(variableValuesFn, { set: variableValuesSet }),
    }
    const db = {
        loadSchema: vi.fn(),
    }

    let service: SessionService

    beforeEach(() => {
        storage.clear()
        vi.restoreAllMocks()

        workspaceStore.schemas.mockReset()
        workspaceStore.workspace.mockReset()
        workspaceStore.activeTab.mockReset()
        workspaceStore.selectedTable.mockReset()
        workspaceStore.restoreWorkspace.mockReset()
        workspaceStore.setActiveTab.mockReset()
        workspaceStore.selectTable.mockReset()

        pipelineStore.source.mockReset()
        pipelineStore.steps.mockReset()
        pipelineStore.openForTable.mockReset()
        pipelineStore.restoreSteps.mockReset()
        variableValuesFn.mockReset()
        variableValuesSet.mockReset()
        db.loadSchema.mockReset()

        service = Object.assign(Object.create(SessionService.prototype), {
            workspaceStore,
            pipelineStore,
            db,
            saveTimer: null,
        }) as SessionService
    })

    it('builds a provider-aware SQLite session', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1234)
        workspaceStore.schemas.mockReturnValue([{ path: '/tmp/app.db', alias: 'main' } satisfies DatabaseSchema])
        workspaceStore.workspace.mockReturnValue({ name: 'Custom Name' })
        workspaceStore.activeTab.mockReturnValue('query')
        workspaceStore.selectedTable.mockReturnValue({ schemaAlias: 'main', tableName: 'users' })
        pipelineStore.source.mockReturnValue({
            path: '/tmp/app.db',
            alias: 'main',
            tableName: 'users',
            columns: ['id', 'name'],
        })
        pipelineStore.steps.mockReturnValue([{ id: 's1', type: 'WHERE', expression: 'id > 1' }])
        variableValuesFn.mockReturnValue({ limit: '10' })

        expect(service.buildSession()).toEqual({
            version: 1,
            providerId: 'sqlite',
            savedAt: 1234,
            workspace: {
                name: 'Custom Name',
                databases: [{ path: '/tmp/app.db', alias: 'main' }],
                activeTab: 'query',
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
        })
    })

    it('returns null when there is no active workspace', () => {
        workspaceStore.schemas.mockReturnValue([])

        expect(service.buildSession()).toBeNull()
    })

    it('restores the new provider-aware SQLite session shape', async () => {
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
        localStorage.setItem('quarry_session', JSON.stringify(session))
        db.loadSchema.mockResolvedValue({ path: '/tmp/app.db', alias: 'main', tables: [], views: [], triggers: [] })

        await service.restore()

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

    it('restores a legacy SQLite session shape through the new path', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(777)
        localStorage.setItem(
            'quarry_session',
            JSON.stringify({
                version: 1,
                databases: [{ path: '/tmp/legacy.db', alias: 'main' }],
                activeTab: 'browse',
                selectedTable: { schemaAlias: 'main', tableName: 'orders' },
                pipeline: {
                    source: null,
                    steps: [],
                    variableValues: {},
                },
            }),
        )
        db.loadSchema.mockResolvedValue({ path: '/tmp/legacy.db', alias: 'main', tables: [], views: [], triggers: [] })

        await service.restore()

        expect(workspaceStore.restoreWorkspace).toHaveBeenCalledWith(
            [{ path: '/tmp/legacy.db', alias: 'main', tables: [], views: [], triggers: [] }],
            'legacy.db',
        )
        expect(workspaceStore.setActiveTab).toHaveBeenCalledWith('browse')
        expect(workspaceStore.selectTable).toHaveBeenCalledWith('main', 'orders')
    })

    it('clears the saved session when SQLite schemas can no longer be reloaded', async () => {
        localStorage.setItem(
            'quarry_session',
            JSON.stringify({
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
            } satisfies SqlitePersistedSession),
        )
        db.loadSchema.mockRejectedValue(new Error('missing'))

        await service.restore()

        expect(localStorage.getItem('quarry_session')).toBeNull()
    })
})
