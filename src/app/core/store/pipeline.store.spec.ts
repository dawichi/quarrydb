import { describe, expect, it } from 'vitest'
import { buildPipelineSql } from './pipeline.store'
import type { PipelineStep } from '@quarrydb/shared'

// Helpers to keep step construction terse
const id = 'test-id'

function cte(...bodies: string[]): string {
    const steps = [`step_1 AS (SELECT * FROM "users")`]
    for (let i = 0; i < bodies.length; i++) {
        steps.push(`step_${i + 2} AS (${bodies[i]})`)
    }
    return `WITH ${steps.join(',\n     ')}\nSELECT * FROM step_${bodies.length + 1}`
}

// ─── buildPipelineSql ─────────────────────────────────────────────────────────

describe('buildPipelineSql', () => {

    describe('no steps', () => {
        it('returns a plain SELECT when there are no steps', () => {
            expect(buildPipelineSql('users', [])).toBe('SELECT * FROM "users"')
        })

        it('quotes table names with spaces', () => {
            expect(buildPipelineSql('my table', [])).toBe('SELECT * FROM "my table"')
        })
    })

    // ─── WHERE ────────────────────────────────────────────────────────────────

    describe('WHERE step', () => {
        it('wraps condition in a CTE', () => {
            const steps: PipelineStep[] = [{ id, type: 'WHERE', expression: 'age > 18' }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1 WHERE age > 18'),
            )
        })

        it('passes through complex boolean expressions', () => {
            const steps: PipelineStep[] = [{ id, type: 'WHERE', expression: "status = 'active' AND score >= 90" }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte("SELECT * FROM step_1 WHERE status = 'active' AND score >= 90"),
            )
        })
    })

    // ─── SELECT ───────────────────────────────────────────────────────────────

    describe('SELECT step', () => {
        it('returns SELECT * when columns array is empty', () => {
            const steps: PipelineStep[] = [{ id, type: 'SELECT', columns: [] }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1'),
            )
        })

        it('lists named columns', () => {
            const steps: PipelineStep[] = [{
                id, type: 'SELECT',
                columns: [{ expr: 'id' }, { expr: 'name' }],
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT id, name FROM step_1'),
            )
        })

        it('applies aliases', () => {
            const steps: PipelineStep[] = [{
                id, type: 'SELECT',
                columns: [{ expr: 'first_name', alias: 'name' }, { expr: 'age' }],
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT first_name AS "name", age FROM step_1'),
            )
        })

        it('skips columns with an empty expression', () => {
            const steps: PipelineStep[] = [{
                id, type: 'SELECT',
                columns: [{ expr: 'id' }, { expr: '' }, { expr: 'name' }],
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT id, name FROM step_1'),
            )
        })

        it('falls back to SELECT * when all expressions are blank', () => {
            const steps: PipelineStep[] = [{
                id, type: 'SELECT',
                columns: [{ expr: '' }, { expr: '   ' }],
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1'),
            )
        })

        it('supports computed expressions', () => {
            const steps: PipelineStep[] = [{
                id, type: 'SELECT',
                columns: [{ expr: 'price * 1.21', alias: 'price_vat' }],
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT price * 1.21 AS "price_vat" FROM step_1'),
            )
        })
    })

    // ─── ORDER BY ─────────────────────────────────────────────────────────────

    describe('ORDER BY step', () => {
        it('sorts by a single column ASC', () => {
            const steps: PipelineStep[] = [{
                id, type: 'ORDER_BY',
                columns: [{ name: 'name', direction: 'ASC' }],
                limit: null,
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1 ORDER BY "name" ASC'),
            )
        })

        it('sorts by multiple columns with mixed directions', () => {
            const steps: PipelineStep[] = [{
                id, type: 'ORDER_BY',
                columns: [{ name: 'score', direction: 'DESC' }, { name: 'name', direction: 'ASC' }],
                limit: null,
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1 ORDER BY "score" DESC, "name" ASC'),
            )
        })

        it('adds LIMIT when set', () => {
            const steps: PipelineStep[] = [{
                id, type: 'ORDER_BY',
                columns: [{ name: 'id', direction: 'ASC' }],
                limit: 100,
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1 ORDER BY "id" ASC LIMIT 100'),
            )
        })

        it('emits just a LIMIT with no sort columns', () => {
            const steps: PipelineStep[] = [{ id, type: 'ORDER_BY', columns: [], limit: 10 }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1 LIMIT 10'),
            )
        })

        it('emits SELECT * when both columns and limit are absent', () => {
            const steps: PipelineStep[] = [{ id, type: 'ORDER_BY', columns: [], limit: null }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1'),
            )
        })
    })

    // ─── GROUP BY ─────────────────────────────────────────────────────────────

    describe('GROUP BY step', () => {
        it('returns SELECT * when groupBy is empty', () => {
            const steps: PipelineStep[] = [{ id, type: 'GROUP_BY', groupBy: [], aggregations: [] }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1'),
            )
        })

        it('groups by a single column with no aggregations', () => {
            const steps: PipelineStep[] = [{ id, type: 'GROUP_BY', groupBy: ['status'], aggregations: [] }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT "status" FROM step_1 GROUP BY "status"'),
            )
        })

        it('includes aggregations alongside group columns', () => {
            const steps: PipelineStep[] = [{
                id, type: 'GROUP_BY',
                groupBy: ['department'],
                aggregations: [{ fn: 'COUNT', expr: '*', alias: 'headcount' }],
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT "department", COUNT(*) AS "headcount" FROM step_1 GROUP BY "department"'),
            )
        })

        it('uses fn name as fallback alias when alias is blank', () => {
            const steps: PipelineStep[] = [{
                id, type: 'GROUP_BY',
                groupBy: ['country'],
                aggregations: [{ fn: 'SUM', expr: 'revenue', alias: '' }],
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT "country", SUM(revenue) AS "sum" FROM step_1 GROUP BY "country"'),
            )
        })

        it('skips aggregation rows with a blank expression', () => {
            const steps: PipelineStep[] = [{
                id, type: 'GROUP_BY',
                groupBy: ['type'],
                aggregations: [{ fn: 'AVG', expr: '', alias: 'avg_score' }],
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT "type" FROM step_1 GROUP BY "type"'),
            )
        })

        it('supports multiple group columns and multiple aggregations', () => {
            const steps: PipelineStep[] = [{
                id, type: 'GROUP_BY',
                groupBy: ['year', 'region'],
                aggregations: [
                    { fn: 'SUM', expr: 'sales', alias: 'total_sales' },
                    { fn: 'AVG', expr: 'margin', alias: 'avg_margin' },
                ],
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT "year", "region", SUM(sales) AS "total_sales", AVG(margin) AS "avg_margin" FROM step_1 GROUP BY "year", "region"'),
            )
        })
    })

    // ─── JOIN ─────────────────────────────────────────────────────────────────

    describe('JOIN step', () => {
        it('returns SELECT * when table is missing', () => {
            const steps: PipelineStep[] = [{ id, type: 'JOIN', mode: 'inline', joinType: 'INNER', table: '', on: 'a.id = b.id' }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1'),
            )
        })

        it('returns SELECT * when ON clause is missing', () => {
            const steps: PipelineStep[] = [{ id, type: 'JOIN', mode: 'inline', joinType: 'INNER', table: 'orders', on: '' }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1'),
            )
        })

        it('generates INNER JOIN for same-schema table', () => {
            const steps: PipelineStep[] = [{
                id, type: 'JOIN', mode: 'inline', joinType: 'INNER',
                table: 'orders', on: 'step_1.id = orders.user_id',
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1 INNER JOIN "orders" ON step_1.id = orders.user_id'),
            )
        })

        it('generates LEFT JOIN', () => {
            const steps: PipelineStep[] = [{
                id, type: 'JOIN', mode: 'inline', joinType: 'LEFT',
                table: 'orders', on: 'step_1.id = orders.user_id',
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1 LEFT JOIN "orders" ON step_1.id = orders.user_id'),
            )
        })

        it('quotes cross-schema table references', () => {
            const steps: PipelineStep[] = [{
                id, type: 'JOIN', mode: 'inline', joinType: 'INNER',
                table: 'analytics.events', on: 'step_1.id = events.user_id',
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1 INNER JOIN "analytics"."events" ON step_1.id = events.user_id'),
            )
        })

        it('adds AS alias when provided', () => {
            const steps: PipelineStep[] = [{
                id, type: 'JOIN', mode: 'inline', joinType: 'INNER',
                table: 'orders', alias: 'o', on: 'step_1.id = o.user_id',
            }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1 INNER JOIN "orders" AS "o" ON step_1.id = o.user_id'),
            )
        })
    })

    // ─── RAW SQL ──────────────────────────────────────────────────────────────

    describe('RAW SQL step', () => {
        it('returns SELECT * when sql is empty', () => {
            const steps: PipelineStep[] = [{ id, type: 'RAW_SQL', sql: '' }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1'),
            )
        })

        it('returns SELECT * when sql is whitespace only', () => {
            const steps: PipelineStep[] = [{ id, type: 'RAW_SQL', sql: '   ' }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1'),
            )
        })

        it('substitutes {src} with the previous step reference', () => {
            const steps: PipelineStep[] = [{ id, type: 'RAW_SQL', sql: 'SELECT * FROM {src} WHERE active = 1' }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT * FROM step_1 WHERE active = 1'),
            )
        })

        it('replaces all occurrences of {src}', () => {
            const steps: PipelineStep[] = [{ id, type: 'RAW_SQL', sql: 'SELECT id FROM {src} UNION SELECT id FROM {src} WHERE deleted = 1' }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT id FROM step_1 UNION SELECT id FROM step_1 WHERE deleted = 1'),
            )
        })

        it('passes through arbitrary SQL verbatim when no {src} placeholder', () => {
            const steps: PipelineStep[] = [{ id, type: 'RAW_SQL', sql: 'SELECT 1 AS one' }]
            expect(buildPipelineSql('users', steps)).toBe(
                cte('SELECT 1 AS one'),
            )
        })
    })

    // ─── Multi-step CTE chaining ──────────────────────────────────────────────

    describe('multi-step pipelines', () => {
        it('chains two steps into a three-CTE query', () => {
            const steps: PipelineStep[] = [
                { id, type: 'WHERE', expression: 'active = 1' },
                { id: 'id2', type: 'ORDER_BY', columns: [{ name: 'name', direction: 'ASC' }], limit: null },
            ]
            expect(buildPipelineSql('users', steps)).toBe(
                'WITH step_1 AS (SELECT * FROM "users"),\n' +
                '     step_2 AS (SELECT * FROM step_1 WHERE active = 1),\n' +
                '     step_3 AS (SELECT * FROM step_2 ORDER BY "name" ASC)\n' +
                'SELECT * FROM step_3',
            )
        })

        it('references the correct prev step at each level', () => {
            const steps: PipelineStep[] = [
                { id, type: 'WHERE', expression: 'score > 50' },
                { id: 'id2', type: 'SELECT', columns: [{ expr: 'id' }, { expr: 'score' }] },
                { id: 'id3', type: 'ORDER_BY', columns: [{ name: 'score', direction: 'DESC' }], limit: 5 },
            ]
            const sql = buildPipelineSql('users', steps)
            expect(sql).toContain('step_2 AS (SELECT * FROM step_1 WHERE score > 50)')
            expect(sql).toContain('step_3 AS (SELECT id, score FROM step_2)')
            expect(sql).toContain('step_4 AS (SELECT * FROM step_3 ORDER BY "score" DESC LIMIT 5)')
            expect(sql).toContain('SELECT * FROM step_4')
        })
    })
})
