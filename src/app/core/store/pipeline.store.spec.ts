import { DatabaseSync } from 'node:sqlite'
import { Injector, runInInjectionContext } from '@angular/core'
import type { BoundSql } from '@quarrydb/shared/pipeline-sql'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportService } from '../services/export.service'
import { QueryHistoryService } from '../services/query-history.service'
import { PipelineStore } from './pipeline.store'
import { columnsFromTables, type PipelineBackend, type PipelineTable } from './pipeline-backend'

function sqliteBackend(key = 'shop.db'): PipelineBackend & { db: DatabaseSync; runs: BoundSql[] } {
    const db = new DatabaseSync(':memory:')
    db.exec(`
        CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, total REAL);
        INSERT INTO customers VALUES (1, 'Alice'), (2, 'Bob');
        INSERT INTO orders VALUES (1, 1, 50), (2, 1, 20), (3, 2, 75);
    `)
    const tables: PipelineTable[] = [
        { name: 'customers', label: 'customers', columns: ['id', 'name'] },
        { name: 'orders', label: 'orders', columns: ['id', 'customer_id', 'total'] },
    ]
    const runs: BoundSql[] = []
    return {
        db,
        runs,
        key,
        label: 'shop',
        dialect: 'sqlite',
        tables: () => tables,
        columnsOf: (name) => columnsFromTables(tables, name),
        run: async (query) => {
            runs.push(query)
            const statement = db.prepare(query.sql)
            const rows = statement.all(...(query.params as Array<string | number>)) as Record<string, unknown>[]
            return { rows, columns: statement.columns().map((column) => column.name) }
        },
        count: async (query) =>
            Number((db.prepare(query.sql).get(...(query.params as Array<string | number>)) as { count: number }).count),
    }
}

async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('PipelineStore', () => {
    let store: PipelineStore
    let backend: ReturnType<typeof sqliteBackend>

    beforeEach(async () => {
        const injector = Injector.create({
            providers: [
                { provide: ExportService, useValue: {} },
                { provide: QueryHistoryService, useValue: { log: vi.fn() } },
            ],
        })
        store = runInInjectionContext(injector, () => new PipelineStore())
        backend = sqliteBackend()
        await store.openForTable({ backend, tableName: 'orders', columns: ['id', 'customer_id', 'total'] })
    })

    it('counts the source table on open', () => {
        expect(store.source()).toMatchObject({ path: 'shop.db', tableName: 'orders', rowCount: 3 })
    })

    it('runs each step and reports rows and totals per step', async () => {
        store.addStep()
        store.updateStepExpression(0, 'total > 30')
        store.addJoinStep()
        store.updateJoinStep(1, 'INNER', 'customers', undefined, 'orders.customer_id = customers.id')
        await settle()

        const [filtered, joined] = store.stepResults()
        expect(filtered).toMatchObject({ total: 2, error: null, isLoading: false })
        expect(joined.columns).toEqual(['id', 'customer_id', 'total', 'customers_id', 'name'])
        expect(joined.rows.map((row) => row.name)).toEqual(['Alice', 'Bob'])
        expect(store.inputColumns(1)).toEqual(['id', 'customer_id', 'total'])
    })

    it('reports what each step did to rows and columns, skipping pass-through steps', async () => {
        store.addStep()
        store.updateStepExpression(0, 'total > 30')
        store.addStep()
        store.addJoinStep()
        store.updateJoinStep(2, 'INNER', 'customers', undefined, 'orders.customer_id = customers.id')
        await settle()

        expect(store.flow(0)).toEqual({ rowsIn: 3, rowsOut: 2, added: [], removed: [] })
        expect(store.flow(1)).toBeNull()
        expect(store.flow(2)).toEqual({ rowsIn: 2, rowsOut: 2, added: ['customers_id', 'name'], removed: [] })
    })

    it('shows compile errors on the step and blocks the ones after it', async () => {
        store.addStep()
        store.updateStepExpression(0, 'total > :min')
        store.addStep()
        store.updateStepExpression(1, 'id > 0')
        await settle()

        expect(store.stepResults().map((result) => result.error)).toEqual([
            'Set a value for :min',
            'Blocked by an error in an earlier step',
        ])

        store.setVariableValue('min', '40')
        store.reExecute()
        await settle()
        expect(store.stepResults().map((result) => result.total)).toEqual([2, 2])
        expect(backend.runs.at(-1)?.params).toEqual([40])
    })

    it('restores saved steps when the matching table opens', async () => {
        store.clear()
        store.restoreWhenOpened({
            path: 'shop.db',
            tableName: 'orders',
            steps: [{ id: 'w', type: 'WHERE', expression: 'customer_id = :who' }],
            variableValues: { who: '2' },
        })
        await store.openForTable({ backend, tableName: 'orders', columns: ['id', 'customer_id', 'total'] })
        await settle()

        expect(store.steps()).toHaveLength(1)
        expect(store.stepResults()[0]).toMatchObject({ total: 1 })
    })

    it('only loads saved queries that belong to the open database', () => {
        const query = {
            id: 'q',
            name: 'Big orders',
            source: { path: 'other.db', alias: 'other', tableName: 'orders', columns: [] },
            steps: [],
            createdAt: 0,
            updatedAt: 0,
        }
        expect(store.loadSavedQuery(query)).toBe(false)
        expect(store.loadSavedQuery({ ...query, source: { ...query.source, path: 'shop.db' } })).toBe(true)
    })

    it('undoes and redoes step edits', async () => {
        store.addStep()
        store.updateStepExpression(0, 'total > 30')
        store.undo()
        expect(store.steps()[0]).toMatchObject({ type: 'WHERE', expression: '' })
        store.undo()
        expect(store.steps()).toEqual([])
        store.redo()
        store.redo()
        expect(store.steps()[0]).toMatchObject({ expression: 'total > 30' })
        expect(store.canRedo()).toBe(false)
    })
})
