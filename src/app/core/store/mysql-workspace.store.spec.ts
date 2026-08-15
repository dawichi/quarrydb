import { signal } from '@angular/core'
import { describe, expect, it, vi } from 'vitest'
import type { MysqlConnectionSession } from '../providers/mysql-backend-adapter'
import { MysqlWorkspaceStore } from './mysql-workspace.store'

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((next) => {
        resolve = next
    })
    return { promise, resolve }
}

const session: MysqlConnectionSession = {
    target: {
        connectionId: 'mysql-test',
        connectionName: 'Test MySQL',
        host: '127.0.0.1',
        port: 3306,
        defaultDatabase: 'warehouse',
    },
    source: 'manual',
    connectedAt: 1,
}

describe('MysqlWorkspaceStore', () => {
    it('keeps the newest schema selection when an older request finishes later', async () => {
        const first = deferred<{ schemaName: string; name: string; columns: never[] }[]>()
        const second = deferred<{ schemaName: string; name: string; columns: never[] }[]>()
        const backend = {
            listTables: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
        }
        const service = createStore(backend)
        service.connectionSession.set(session)

        const oldSelection = service.selectSchema('old')
        const newSelection = service.selectSchema('new')

        second.resolve([{ schemaName: 'new', name: 'new_table', columns: [] }])
        await newSelection
        first.resolve([{ schemaName: 'old', name: 'old_table', columns: [] }])
        await oldSelection

        expect(service.selectedSchemaName()).toBe('new')
        expect(service.tables()).toEqual([{ schemaName: 'new', name: 'new_table', columns: [] }])
        expect(service.isLoadingTables()).toBe(false)
    })

    it('keeps the newest table rows when selection changes during a request', async () => {
        const first = deferred<{ rows: Record<string, unknown>[]; columns: string[]; total: number }>()
        const second = deferred<{ rows: Record<string, unknown>[]; columns: string[]; total: number }>()
        const backend = {
            queryTableRows: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
        }
        const service = createStore(backend)
        service.connectionSession.set(session)
        service.selectedSchemaName.set('warehouse')

        const oldSelection = service.selectTable('warehouse', 'old_table')
        const newSelection = service.selectTable('warehouse', 'new_table')

        second.resolve({ rows: [{ id: 2 }], columns: ['id'], total: 1 })
        await newSelection
        first.resolve({ rows: [{ id: 1 }], columns: ['id'], total: 1 })
        await oldSelection

        expect(service.selectedTable()).toEqual({ schemaName: 'warehouse', tableName: 'new_table' })
        expect(service.tableRows()).toEqual([{ id: 2 }])
        expect(service.tableColumns()).toEqual(['id'])
        expect(service.isLoadingRows()).toBe(false)
    })

    it('keeps the newest query result when a workspace query is replaced', async () => {
        const first = deferred<{ kind: 'rows'; rows: Record<string, unknown>[]; columns: string[] }>()
        const second = deferred<{ kind: 'rows'; rows: Record<string, unknown>[]; columns: string[] }>()
        const backend = {
            runQuery: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
        }
        const service = createStore(backend)
        service.connectionSession.set(session)

        service.querySql.set('SELECT 1')
        const oldQuery = service.runQuery()
        service.querySql.set('SELECT 2')
        const newQuery = service.runQuery()

        second.resolve({ kind: 'rows', rows: [{ value: 2 }], columns: ['value'] })
        await newQuery
        first.resolve({ kind: 'rows', rows: [{ value: 1 }], columns: ['value'] })
        await oldQuery

        expect(service.queryRows()).toEqual([{ value: 2 }])
        expect(service.queryColumns()).toEqual(['value'])
        expect(service.isRunningQuery()).toBe(false)
    })
})

function createStore(backend: {
    listTables?: ReturnType<typeof vi.fn>
    queryTableRows?: ReturnType<typeof vi.fn>
    runQuery?: ReturnType<typeof vi.fn>
}): MysqlWorkspaceStore {
    return Object.assign(Object.create(MysqlWorkspaceStore.prototype), {
        host: { error: { set: vi.fn() }, setWorkspaceOpen: vi.fn() },
        backend,
        exportService: {},
        editStore: { clearAll: vi.fn(), hasPending: vi.fn(), applyAllWith: vi.fn() },
        connectionSession: signal<MysqlConnectionSession | null>(null),
        schemas: signal([]),
        selectedSchemaName: signal<string | null>(null),
        tables: signal([]),
        selectedTable: signal(null),
        tableRows: signal<Record<string, unknown>[]>([]),
        tableColumns: signal<string[]>([]),
        tableRowTotal: signal(0),
        browseFilter: signal(''),
        browseSortColumn: signal<string | null>(null),
        browseSortDirection: signal<'asc' | 'desc'>('asc'),
        activeTab: signal('browse'),
        querySql: signal(''),
        queryRows: signal([]),
        queryColumns: signal<string[]>([]),
        queryMeta: signal<string | null>(null),
        sampleDataStatus: signal<string | null>(null),
        isLoadingTables: signal(false),
        isLoadingRows: signal(false),
        isRunningQuery: signal(false),
        isSeedingSampleData: signal(false),
        isExporting: signal(false),
        rowOffset: 0,
        schemaRequestId: 0,
        rowsRequestId: 0,
        queryRequestId: 0,
    }) as MysqlWorkspaceStore
}
