import type { DatabaseSchema } from '@quarrydb/shared'
import type { PersistedSession, SqlitePersistedSession } from '@quarrydb/shared/session'
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
    const workspaceStore = {
        schemas: vi.fn(),
        workspace: vi.fn(),
        activeTab: vi.fn(),
        selectedTable: vi.fn(),
    }
    const pipelineStore = {
        source: vi.fn(),
        steps: vi.fn(),
        variableValues: variableValuesFn,
    }
    const providers = {
        restoreSession: vi.fn(),
    }

    let service: SessionService

    beforeEach(() => {
        storage.clear()
        vi.restoreAllMocks()

        workspaceStore.schemas.mockReset()
        workspaceStore.workspace.mockReset()
        workspaceStore.activeTab.mockReset()
        workspaceStore.selectedTable.mockReset()
        pipelineStore.source.mockReset()
        pipelineStore.steps.mockReset()
        variableValuesFn.mockReset()
        providers.restoreSession.mockReset()

        service = Object.assign(Object.create(SessionService.prototype), {
            providers,
            workspaceStore,
            pipelineStore,
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

    it('dispatches a provider-aware session to the registry on restore', async () => {
        const session: SqlitePersistedSession = {
            version: 1,
            providerId: 'sqlite',
            savedAt: 1234,
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
        localStorage.setItem('quarry_session', JSON.stringify(session))

        await service.restore()

        expect(providers.restoreSession).toHaveBeenCalledWith(session)
    })

    it('normalizes the legacy SQLite session shape before dispatch', async () => {
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

        await service.restore()

        expect(providers.restoreSession).toHaveBeenCalledWith({
            version: 1,
            providerId: 'sqlite',
            savedAt: 777,
            workspace: {
                name: 'legacy.db',
                databases: [{ path: '/tmp/legacy.db', alias: 'main' }],
                activeTab: 'browse',
                selectedTable: { schemaAlias: 'main', tableName: 'orders' },
            },
            pipeline: {
                source: null,
                steps: [],
                variableValues: {},
            },
        } satisfies PersistedSession)
    })

    it('clears the saved session when provider restore fails', async () => {
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
        providers.restoreSession.mockRejectedValue(new Error('missing'))

        await service.restore()

        expect(localStorage.getItem('quarry_session')).toBeNull()
    })
})
