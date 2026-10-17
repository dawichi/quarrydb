import type { PipelineStep } from '@quarrydb/shared'
import { compilePipeline } from '@quarrydb/shared/pipeline-sql'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ExportService } from '../services/export.service'
import { SqliteDatabaseService } from '../services/sqlite-database.service'
import { closeFixtureDbs, seedFixtureDb } from './fixtures/fake-sql-client'
import { SAMPLE_SCHEMA_SQL } from './fixtures/sample-schema'

// Replace the native SQL client with a real-SQLite-backed fake — see fixtures/fake-sql-client.
// `vi.mock` factories are hoisted above imports, so SqliteDatabaseService picks up the fake transparently.
vi.mock('../native/sql-client', async (importOriginal) => {
    const { fakeConnectSql } = await import('./fixtures/fake-sql-client')
    return { ...(await importOriginal<object>()), connectSql: fakeConnectSql }
})

const FIXTURE_PATH = 'pipeline-run.test.db'

const db = new SqliteDatabaseService()
const exportSvc = new ExportService()

beforeAll(() => seedFixtureDb(FIXTURE_PATH, SAMPLE_SCHEMA_SQL))
afterAll(() => closeFixtureDbs())

/** Compiles against the real schema (as the app does) and runs through the SQL client. */
async function runPipeline(table: string, steps: PipelineStep[]): Promise<Record<string, unknown>[]> {
    const schema = await db.loadSchema(FIXTURE_PATH, 'main')
    const compiled = compilePipeline(table, steps, {
        schema: { columnsOf: (name) => schema.tables.find((t) => t.name === name)?.columns.map((c) => c.name) },
    })
    const failed = compiled.steps.find((step) => step.error)
    if (failed) throw new Error(failed.error ?? 'compile error')
    const { sql, params } = compiled.query(steps.length - 1)
    return (await db.runBound(FIXTURE_PATH, sql, params)).rows
}

// ─── Pipeline build → run ─────────────────────────────────────────────────────

describe('pipeline run (integration)', () => {
    it('runs a generated CTE chain through the SQL client and returns real rows', async () => {
        const steps: PipelineStep[] = [{ id: 's1', type: 'WHERE', expression: "status = 'shipped'" }]
        const rows = await runPipeline('orders', steps)
        expect(rows.map((r) => r.id)).toEqual([1, 3])
    })

    it('executes a JOIN step against the real schema', async () => {
        const steps: PipelineStep[] = [
            {
                id: 's1',
                type: 'JOIN',
                mode: 'inline',
                joinType: 'INNER',
                table: 'customers',
                alias: 'c',
                on: 'orders.customer_id = c.id',
            },
            // The JOIN flattens its output: joined columns keep their name unless the left
            // side already has it (`c.id` becomes `c_id`), so later steps use bare names.
            {
                id: 's2',
                type: 'SELECT',
                columns: [{ expr: 'total' }, { expr: 'name', alias: 'customer' }],
            },
        ]
        const rows = await runPipeline('orders', steps)
        expect(rows).toEqual([
            { total: 50, customer: 'Alice' },
            { total: 20, customer: 'Alice' },
            { total: 75.5, customer: 'Bob' },
            { total: 12.25, customer: 'Carol' },
        ])
    })

    it('aggregates with GROUP BY against real data', async () => {
        const steps: PipelineStep[] = [
            {
                id: 's1',
                type: 'GROUP_BY',
                groupBy: ['customer_id'],
                aggregations: [{ fn: 'SUM', expr: 'total', alias: 'order_total' }],
            },
            { id: 's2', type: 'ORDER_BY', columns: [{ name: 'customer_id', direction: 'ASC' }], limit: null },
        ]
        const rows = await runPipeline('orders', steps)
        expect(rows).toEqual([
            { customer_id: 1, order_total: 70 },
            { customer_id: 2, order_total: 75.5 },
            { customer_id: 3, order_total: 12.25 },
        ])
    })

    it('blocks downstream execution when an early step errors', async () => {
        const steps: PipelineStep[] = [
            { id: 's1', type: 'WHERE', expression: 'not_a_real_column = 1' },
            { id: 's2', type: 'SELECT', columns: [{ expr: 'id' }] },
        ]
        await expect(runPipeline('orders', steps)).rejects.toThrow(/no such column/i)
    })
})

// ─── Pipeline run → export ────────────────────────────────────────────────────

describe('pipeline run → export (integration)', () => {
    it('chains real query results into every export format', async () => {
        const steps: PipelineStep[] = [
            { id: 's1', type: 'WHERE', expression: "status = 'shipped'" },
            { id: 's2', type: 'SELECT', columns: [{ expr: 'id' }, { expr: 'total' }] },
        ]
        const rows = await runPipeline('orders', steps)
        const columns = Object.keys(rows[0])

        expect(exportSvc.toCsv(columns, rows)).toBe('id,total\n1,50\n3,75.5')
        expect(JSON.parse(exportSvc.toJson(rows))).toEqual(rows)
        expect(exportSvc.toMarkdown(columns, rows)).toBe('| id | total |\n| --- | --- |\n| 1 | 50 |\n| 3 | 75.5 |')
        expect(exportSvc.toSqlInserts('orders_export', columns, rows)).toBe(
            'INSERT INTO "orders_export" ("id", "total") VALUES (1, 50);\n' +
                'INSERT INTO "orders_export" ("id", "total") VALUES (3, 75.5);',
        )
    })
})
