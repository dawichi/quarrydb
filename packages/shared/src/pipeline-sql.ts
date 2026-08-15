import type { JoinStep, PipelineStep } from './index'
import { quoteIdentifier, quoteQualifiedIdentifier } from './sql-identifiers'

export type PipelineSqlDialect = 'sqlite' | 'mysql'

function substituteVars(text: string, vars: Record<string, string>): string {
    return text.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name: string) => vars[name] ?? `:${name}`)
}

function buildStepCte(
    prev: string,
    step: PipelineStep,
    vars: Record<string, string>,
    dialect: PipelineSqlDialect,
): string {
    const v = (text: string) => substituteVars(text, vars)
    const quote = (identifier: string) => quoteIdentifier(identifier, dialect)
    switch (step.type) {
        case 'SELECT': {
            if (step.columns.length === 0) return `SELECT * FROM ${prev}`
            const cols = step.columns
                .filter((column) => column.expr.trim())
                .map((column) => (column.alias ? `${v(column.expr)} AS ${quote(column.alias)}` : v(column.expr)))
                .join(', ')
            return cols ? `SELECT ${cols} FROM ${prev}` : `SELECT * FROM ${prev}`
        }
        case 'WHERE':
            return `SELECT * FROM ${prev} WHERE ${v(step.expression)}`
        case 'ORDER_BY': {
            let sql = `SELECT * FROM ${prev}`
            if (step.columns.length > 0) {
                sql += ` ORDER BY ${step.columns.map((column) => `${quote(column.name)} ${column.direction}`).join(', ')}`
            }
            if (step.limit !== null) sql += ` LIMIT ${step.limit}`
            return sql
        }
        case 'GROUP_BY': {
            if (step.groupBy.length === 0) return `SELECT * FROM ${prev}`
            const groupCols = step.groupBy.map(quote).join(', ')
            const selectParts: string[] = step.groupBy.map(quote)
            for (const aggregation of step.aggregations) {
                if (aggregation.expr.trim()) {
                    const alias = aggregation.alias.trim() || aggregation.fn.toLowerCase()
                    selectParts.push(`${aggregation.fn}(${v(aggregation.expr)}) AS ${quote(alias)}`)
                }
            }
            return `SELECT ${selectParts.join(', ')} FROM ${prev} GROUP BY ${groupCols}`
        }
        case 'JOIN': {
            if (!step.table || !step.on.trim()) return `SELECT * FROM ${prev}`
            const tableRef = quoteQualifiedIdentifier(step.table, dialect)
            const alias = step.alias ? ` AS ${quote(step.alias)}` : ''
            return `SELECT * FROM ${prev} ${step.joinType} JOIN ${tableRef}${alias} ON ${v(step.on)}`
        }
        case 'RAW_SQL': {
            const sql = v(step.sql.trim())
            return sql ? sql.replaceAll('{src}', prev) : `SELECT * FROM ${prev}`
        }
        default:
            return `SELECT * FROM ${prev}`
    }
}

function pushSubpipelineJoinCtes(
    ctes: string[],
    step: JoinStep,
    prev: string,
    curr: string,
    vars: Record<string, string>,
    dialect: PipelineSqlDialect,
): void {
    const subTable = step.subTable ?? ''
    const subSteps = step.subSteps ?? []
    if (!subTable || !step.on.trim()) {
        ctes.push(`${curr} AS (SELECT * FROM ${prev})`)
        return
    }

    const prefix = `${curr}_sub`
    ctes.push(`${prefix}_1 AS (SELECT * FROM ${quoteQualifiedIdentifier(subTable, dialect)})`)
    for (let j = 0; j < subSteps.length; j++) {
        ctes.push(`${prefix}_${j + 2} AS (${buildStepCte(`${prefix}_${j + 1}`, subSteps[j], vars, dialect)})`)
    }
    const finalSub = `${prefix}_${subSteps.length + 1}`
    const alias = step.alias ? ` AS ${quoteIdentifier(step.alias, dialect)}` : ''
    ctes.push(
        `${curr} AS (SELECT * FROM ${prev} ${step.joinType} JOIN ${finalSub}${alias} ON ${substituteVars(step.on, vars)})`,
    )
}

export function buildPipelineSql(
    tableName: string,
    steps: PipelineStep[],
    vars: Record<string, string> = {},
    dialect: PipelineSqlDialect = 'sqlite',
): string {
    const source = quoteQualifiedIdentifier(tableName, dialect)
    if (steps.length === 0) return `SELECT * FROM ${source}`

    const ctes = [`step_1 AS (SELECT * FROM ${source})`]
    for (let i = 0; i < steps.length; i++) {
        const prev = `step_${i + 1}`
        const curr = `step_${i + 2}`
        const step = steps[i]
        if (step.type === 'JOIN' && step.mode === 'subpipeline') {
            pushSubpipelineJoinCtes(ctes, step, prev, curr, vars, dialect)
        } else {
            ctes.push(`${curr} AS (${buildStepCte(prev, step, vars, dialect)})`)
        }
    }
    return `WITH ${ctes.join(',\n     ')}\nSELECT * FROM step_${steps.length + 1}`
}
