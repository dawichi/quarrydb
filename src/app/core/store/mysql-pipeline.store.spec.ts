import { signal } from '@angular/core'
import { describe, expect, it, vi } from 'vitest'
import type { MysqlConnectionSession } from '../providers/mysql-backend-adapter'
import { MysqlPipelineStore } from './mysql-pipeline.store'

const session: MysqlConnectionSession = {
    target: {
        connectionId: 'mysql-test',
        connectionName: 'Test MySQL',
        host: '127.0.0.1',
        port: 3306,
        defaultDatabase: 'warehouse',
    },
    source: 'saved_profile',
    connectedAt: 1,
}

function createStore() {
    const backend = {
        runQuery: vi.fn().mockResolvedValue({
            kind: 'rows' as const,
            rows: [{ id: 1, name: 'Widget' }],
            columns: ['id', 'name'],
        }),
        runQueryFull: vi.fn().mockResolvedValue([{ id: 1, name: 'Widget' }]),
    }
    const exportService = {
        toCsv: vi.fn().mockReturnValue('id,name\n1,Widget'),
        toJson: vi.fn().mockReturnValue('[{"id":1}]'),
        toSqlInserts: vi.fn().mockReturnValue('INSERT'),
        toMarkdown: vi.fn().mockReturnValue('| id |'),
        saveFile: vi.fn().mockResolvedValue(true),
    }
    const store = Object.assign(Object.create(MysqlPipelineStore.prototype), {
        backend,
        exportService,
        source: signal(null),
        steps: signal([]),
        stepResults: signal([]),
        variableValues: signal({}),
        isRunning: signal(false),
        error: signal(null),
        generatedSql: vi.fn(() => 'SELECT * FROM `warehouse`.`products`'),
        session: null,
        sourceKey: '',
    }) as MysqlPipelineStore
    return { store, backend, exportService }
}

describe('MysqlPipelineStore', () => {
    it('executes each pipeline prefix with MySQL SQL and stores intermediate previews', async () => {
        const { store, backend } = createStore()
        store.openForTable(session, 'warehouse', 'products', ['id', 'name'])

        store.restoreState([{ id: 'where-1', type: 'WHERE', expression: 'id > 0' }], {})
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(backend.runQuery).toHaveBeenCalled()
        expect(backend.runQuery.mock.calls.at(-1)?.[1]).toContain('`warehouse`.`products`')
        expect(backend.runQuery.mock.calls.at(-1)?.[1]).toContain('WHERE id > 0')
        expect(store.stepResults()[0]).toMatchObject({ rows: [{ id: 1, name: 'Widget' }], error: null })
    })

    it('blocks downstream previews after an upstream execution error', async () => {
        const { store, backend } = createStore()
        backend.runQuery.mockRejectedValueOnce(new Error('Unknown column'))
        store.openForTable(session, 'warehouse', 'products', ['id'])
        store.restoreState(
            [
                { id: 'where-1', type: 'WHERE', expression: 'missing > 0' },
                { id: 'order-1', type: 'ORDER_BY', columns: [], limit: null },
            ],
            {},
        )
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(store.stepResults()[0]?.error).toBe('Unknown column')
        expect(store.stepResults()[1]?.error).toBe('Blocked by upstream error')
    })

    it('restores steps and variables, then executes the restored pipeline', async () => {
        const { store, backend } = createStore()
        store.openForTable(session, 'warehouse', 'products', ['id'])
        store.restoreState([{ id: 'where-1', type: 'WHERE', expression: 'id > :minimum' }], { minimum: '2' })
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(store.steps()).toEqual([{ id: 'where-1', type: 'WHERE', expression: 'id > :minimum' }])
        expect(store.variableValues()).toEqual({ minimum: '2' })
        expect(backend.runQuery.mock.calls.at(-1)?.[1]).toContain('WHERE id > 2')
    })

    it('exports the uncapped final result through the shared export service', async () => {
        const { store, backend, exportService } = createStore()
        store.openForTable(session, 'warehouse', 'products', ['id', 'name'])
        expect(store.source()).toMatchObject({ schemaName: 'warehouse', tableName: 'products' })
        await store.exportResult('csv')

        expect(backend.runQueryFull).toHaveBeenCalledWith(session, 'SELECT * FROM `warehouse`.`products`')
        expect(exportService.toCsv).toHaveBeenCalledWith(['id', 'name'], [{ id: 1, name: 'Widget' }])
        expect(exportService.saveFile).toHaveBeenCalledWith('id,name\n1,Widget', 'products_pipeline.csv', 'csv')
    })
})
