import { describe, expect, it } from 'vitest'
import { buildPipelineSql } from './pipeline-sql'

const id = 'step-id'

describe('buildPipelineSql dialects', () => {
    it('keeps SQLite output compatible with the existing builder', () => {
        expect(buildPipelineSql('users', [{ id, type: 'WHERE', expression: 'active = 1' }])).toContain(
            'step_1 AS (SELECT * FROM "users")',
        )
    })

    it('quotes MySQL schema-qualified sources with backticks', () => {
        expect(buildPipelineSql('warehouse.users', [], {}, 'mysql')).toBe('SELECT * FROM `warehouse`.`users`')
    })

    it('keeps hostile identifier text inside quoted boundaries', () => {
        expect(buildPipelineSql('users"; DROP TABLE users;--', [])).toBe('SELECT * FROM "users""; DROP TABLE users;--"')
    })

    it('uses MySQL quoting for aliases, ordering, grouping, and joins', () => {
        const sql = buildPipelineSql(
            'warehouse.users',
            [
                { id, type: 'SELECT', columns: [{ expr: 'name', alias: 'display name' }] },
                { id: 'order', type: 'ORDER_BY', columns: [{ name: 'display name', direction: 'DESC' }], limit: 10 },
                {
                    id: 'join',
                    type: 'JOIN',
                    mode: 'inline',
                    joinType: 'LEFT',
                    table: 'warehouse.orders',
                    alias: 'recent orders',
                    on: 'users.id = `recent orders`.user_id',
                },
            ],
            {},
            'mysql',
        )

        expect(sql).toContain('SELECT name AS `display name` FROM step_1')
        expect(sql).toContain('ORDER BY `display name` DESC LIMIT 10')
        expect(sql).toContain('LEFT JOIN `warehouse`.`orders` AS `recent orders`')
    })

    it('quotes MySQL subpipeline sources and preserves variables', () => {
        const sql = buildPipelineSql(
            'warehouse.users',
            [
                {
                    id,
                    type: 'JOIN',
                    mode: 'subpipeline',
                    joinType: 'INNER',
                    subTable: 'warehouse.orders',
                    subSteps: [{ id: 'sub', type: 'WHERE', expression: 'total > :minimum' }],
                    on: 'users.id = orders.user_id',
                },
            ],
            { minimum: '100' },
            'mysql',
        )

        expect(sql).toContain('step_2_sub_1 AS (SELECT * FROM `warehouse`.`orders`)')
        expect(sql).toContain('WHERE total > 100')
    })
})
