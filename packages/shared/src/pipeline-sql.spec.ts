import { DatabaseSync } from 'node:sqlite'
import { beforeAll, describe, expect, it } from 'vitest'
import type { JoinStep, PipelineStep } from './index'
import { buildPipelineSql, compilePipeline, findVariables, type PipelineSchema, suggestJoinOn } from './pipeline-sql'

// These tests run every compiled query against real SQLite. Comparing SQL strings alone is
// how a JOIN that produced duplicate columns once shipped unnoticed.

const db = new DatabaseSync(':memory:')

beforeAll(() => {
    db.exec(`
        CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL);
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            total REAL NOT NULL,
            status TEXT NOT NULL,
            placed_at TEXT NOT NULL
        );
        INSERT INTO customers VALUES (1, 'Alice', 'ES'), (2, 'Bob', 'FR'), (3, 'Carol', 'ES'), (4, 'Dave', 'DE');
        INSERT INTO orders VALUES
            (10, 1, 50.0, 'shipped', '2026-01-01 10:30'),
            (11, 1, 20.0, 'pending', '2026-01-02 09:00'),
            (12, 2, 75.5, 'shipped', '2026-01-03 10:30'),
            (13, 3, 12.25, 'cancelled', '2026-01-04 18:00');
    `)
})

const schema: PipelineSchema = {
    columnsOf: (table) =>
        ({
            customers: ['id', 'name', 'country'],
            orders: ['id', 'customer_id', 'total', 'status', 'placed_at'],
        })[table],
}

let nextId = 0
const id = () => `step-${++nextId}`
const where = (expression: string): PipelineStep => ({ id: id(), type: 'WHERE', expression })
const joinCustomers = (on: string, extra: Partial<JoinStep> = {}): PipelineStep => ({
    id: id(),
    type: 'JOIN',
    mode: 'inline',
    joinType: 'INNER',
    table: 'customers',
    on,
    ...extra,
})

function run(steps: PipelineStep[], variables: Record<string, string> = {}, index = steps.length - 1) {
    const compiled = compilePipeline('orders', steps, { schema, variables })
    const failed = compiled.steps.find((step) => step.error)
    if (failed) throw new Error(failed.error ?? 'compile error')
    const { sql, params } = compiled.query(index)
    const statement = db.prepare(sql)
    const rows = statement.all(...(params as Array<string | number>)) as Record<string, unknown>[]
    return { rows, columns: statement.columns().map((column) => column.name), compiled }
}

describe('compilePipeline against SQLite', () => {
    it('joins with the natural `table.column` syntax even when JOIN is not the first step', () => {
        const { rows } = run([where("status = 'shipped'"), joinCustomers('orders.customer_id = customers.id')])

        expect(rows.map((row) => [row.id, row.name])).toEqual([
            [10, 'Alice'],
            [12, 'Bob'],
        ])
    })

    it('never produces duplicate column names, and later steps filter the column they name', () => {
        const { columns, rows } = run([joinCustomers('orders.customer_id = customers.id'), where('id = 12')])

        expect(columns).toEqual([
            'id',
            'customer_id',
            'total',
            'status',
            'placed_at',
            'customers_id',
            'name',
            'country',
        ])
        expect(new Set(columns).size).toBe(columns.length)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ id: 12, customers_id: 2, name: 'Bob' })
    })

    it('keeps meaning when steps are reordered, because nothing references step numbers', () => {
        const filter = where("orders.status <> 'cancelled'")
        const join = joinCustomers('orders.customer_id = customers.id')
        const before = run([filter, join]).rows
        const after = run([join, filter]).rows

        expect(after).toEqual(before)
    })

    it('still runs JOIN steps saved before 0.2 that referenced `step_N`', () => {
        const { rows } = run([where('total > 15'), joinCustomers('step_2.customer_id = customers.id')])
        expect(rows.map((row) => row.name)).toEqual(['Alice', 'Alice', 'Bob'])
    })

    it('tracks columns through every step for the UI', () => {
        const { compiled } = run([
            joinCustomers('orders.customer_id = customers.id'),
            {
                id: id(),
                type: 'GROUP_BY',
                groupBy: ['country'],
                aggregations: [{ fn: 'SUM', expr: 'total', alias: 'revenue' }],
            },
            { id: id(), type: 'SELECT', columns: [{ expr: 'country' }, { expr: 'revenue * 2', alias: 'double' }] },
        ])

        expect(compiled.steps.map((step) => step.columns)).toEqual([
            ['id', 'customer_id', 'total', 'status', 'placed_at', 'customers_id', 'name', 'country'],
            ['country', 'revenue'],
            ['country', 'double'],
        ])
        expect(compiled.steps[1].inputColumns).toContain('customers_id')
    })

    it('fails a GROUP BY or ORDER BY whose column an earlier step no longer provides', () => {
        // SQLite would read the quoted "country" as a string and return one bogus group.
        const groupBy: PipelineStep = {
            id: id(),
            type: 'GROUP_BY',
            groupBy: ['country'],
            aggregations: [{ fn: 'COUNT', expr: '*', alias: 'n' }],
        }
        const sort: PipelineStep = {
            id: id(),
            type: 'ORDER_BY',
            columns: [{ name: 'country', direction: 'ASC' }],
            limit: null,
        }
        const join = joinCustomers('orders.customer_id = customers.id')
        const { steps } = compilePipeline('orders', [groupBy, sort, join], { schema })

        expect(steps[0].error).toBe('Column "country" isn\'t available at this step')
        expect(steps[1].error).toBe('Column "country" isn\'t available at this step')
        expect(compilePipeline('orders', [join, groupBy, sort], { schema }).steps.map((step) => step.error)).toEqual([
            null,
            null,
            null,
        ])
    })

    it('binds variables as parameters: numbers compare numerically, quotes cannot escape', () => {
        expect(run([where('total > :min')], { min: '30' }).rows.map((row) => row.id)).toEqual([10, 12])
        expect(run([where('status = :status')], { status: "x' OR '1'='1" }).rows).toEqual([])
    })

    it('leaves colons inside string literals alone', () => {
        const { rows } = run([where("placed_at LIKE '%10:30'")])
        expect(rows.map((row) => row.id)).toEqual([10, 12])
        expect(findVariables("placed_at LIKE '%10:30' AND total > :min -- :not_this")).toEqual(['min'])
    })

    it('reports an unset variable on the step instead of sending broken SQL', () => {
        const compiled = compilePipeline('orders', [where('total > :min')], { schema })
        expect(compiled.steps[0].error).toBe('Set a value for :min')
    })

    it('keeps ORDER BY in effect for the final rows across later filters', () => {
        const { rows } = run([
            { id: id(), type: 'ORDER_BY', columns: [{ name: 'total', direction: 'DESC' }], limit: null },
            where("status <> 'cancelled'"),
        ])
        expect(rows.map((row) => row.total)).toEqual([75.5, 50, 20])
    })

    it('applies ORDER BY + LIMIT inside the step and previews with an outer limit', () => {
        const steps: PipelineStep[] = [
            { id: id(), type: 'ORDER_BY', columns: [{ name: 'total', direction: 'ASC' }], limit: 3 },
        ]
        const compiled = compilePipeline('orders', steps, { schema })
        const preview = compiled.query(0, { limit: 2 })
        const rows = db.prepare(preview.sql).all() as Record<string, unknown>[]
        const count = db.prepare(compiled.count(0).sql).get() as { count: number }

        expect(rows.map((row) => row.total)).toEqual([12.25, 20])
        expect(count.count).toBe(3)
    })

    it('joins a filtered subpipeline', () => {
        const { rows } = run([
            {
                id: id(),
                type: 'JOIN',
                mode: 'subpipeline',
                joinType: 'INNER',
                table: '',
                subTable: 'customers',
                subSteps: [where("country = 'ES'")],
                on: 'orders.customer_id = customers.id',
            },
        ])
        expect(rows.map((row) => row.id)).toEqual([10, 11, 13])
    })

    it('prefixes every joined column after a raw SQL step, whose columns are unknown', () => {
        const { columns, compiled } = run([
            { id: id(), type: 'RAW_SQL', sql: 'SELECT id, customer_id FROM {src} WHERE total > 15;' },
            joinCustomers('orders.customer_id = customers.id'),
        ])
        expect(compiled.steps[0].columns).toBeNull()
        expect(columns).toEqual(['id', 'customer_id', 'customers_id', 'customers_name', 'customers_country'])
    })

    it('asks for an alias on self-joins and refuses FULL JOIN on MySQL', () => {
        const selfJoin = compilePipeline('orders', [joinCustomers('orders.id = orders.id', { table: 'orders' })], {
            schema,
        })
        expect(selfJoin.steps[0].error).toContain('alias')

        const full = compilePipeline(
            'orders',
            [joinCustomers('orders.customer_id = customers.id', { joinType: 'FULL' })],
            {
                schema,
                dialect: 'mysql',
            },
        )
        expect(full.steps[0].error).toContain('FULL JOIN')
    })

    it('treats incomplete steps as pass-throughs', () => {
        const { rows, compiled } = run([where('  '), joinCustomers('')])
        expect(compiled.steps.every((step) => step.isNoop)).toBe(true)
        expect(rows).toHaveLength(4)
    })
})

describe('buildPipelineSql', () => {
    it('quotes MySQL sources, aliases and joins with backticks', () => {
        const sql = buildPipelineSql(
            'warehouse.users',
            [
                { id: id(), type: 'SELECT', columns: [{ expr: 'name', alias: 'display name' }] },
                { id: id(), type: 'ORDER_BY', columns: [{ name: 'display name', direction: 'DESC' }], limit: 10 },
            ],
            {},
            'mysql',
        )
        expect(sql).toContain('step_1 AS (SELECT * FROM `warehouse`.`users`)')
        expect(sql).toContain('SELECT name AS `display name` FROM step_1 AS `users`')
        expect(sql).toContain('ORDER BY `display name` DESC LIMIT 10')
    })

    it('keeps hostile identifier text inside quoted boundaries', () => {
        expect(buildPipelineSql('users"; DROP TABLE users;--', [])).toBe('SELECT * FROM "users""; DROP TABLE users;--"')
    })

    it('shows variable values inline and unset variables by name', () => {
        expect(buildPipelineSql('orders', [where('total > :min AND status = :status')], { min: '10' })).toContain(
            'WHERE total > 10 AND status = :status',
        )
        expect(buildPipelineSql('orders', [where('status = :status')], { status: "O'Brien" })).toContain(
            "WHERE status = 'O''Brien'",
        )
    })
})

describe('suggestJoinOn', () => {
    it('follows foreign-key naming in either direction', () => {
        expect(suggestJoinOn('orders', ['id', 'customer_id'], 'customers', ['id', 'name'])).toBe(
            'orders.customer_id = customers.id',
        )
        expect(suggestJoinOn('customers', ['id', 'name'], 'orders', ['id', 'customer_id'])).toBe(
            'customers.id = orders.customer_id',
        )
        expect(suggestJoinOn('categories', ['id'], 'products', ['category_id'])).toBe(
            'categories.id = products.category_id',
        )
        expect(suggestJoinOn('orders', ['id'], 'audit', ['at'])).toBe('')
    })
})
