import type { JoinStep, PipelineStep, SortColumn } from './index'
import { quoteIdentifier, quoteQualifiedIdentifier } from './sql-identifiers'

export type PipelineSqlDialect = 'sqlite' | 'mysql'

/**
 * Pipeline compiler.
 *
 * A pipeline is a source table followed by steps. Each step becomes one CTE, and every step
 * reads the previous result under the source table's own name, so `orders.total` means the
 * same thing in step 1 and step 7, whatever the steps around it. The compiler also tracks the
 * columns flowing out of every step, which is what lets JOIN produce an explicit,
 * collision-free projection and lets the UI offer the right columns at each step.
 *
 * Variables (`:name`) are bound as parameters, never spliced into SQL text.
 */

export interface PipelineSchema {
    /** Columns of a table as a step names it (`customers` or `shop.customers`); undefined if unknown. */
    columnsOf(table: string): string[] | undefined
}

export interface CompilePipelineOptions {
    dialect?: PipelineSqlDialect
    variables?: Record<string, string>
    /** Columns of the source table. Without them, JOIN prefixes every joined column. */
    sourceColumns?: string[]
    schema?: PipelineSchema
    /** Display-only: leave unset `:name` variables in the text instead of failing the step. */
    keepMissingVariables?: boolean
}

export interface BoundSql {
    sql: string
    params: unknown[]
}

export interface CompiledStep {
    stepId: string
    /** Columns flowing into the step; null when an upstream raw SQL step hides them. */
    inputColumns: string[] | null
    /** Columns flowing out of the step; null when they can only be known by running it. */
    columns: string[] | null
    /** Incomplete steps pass rows through unchanged and are not worth running on their own. */
    isNoop: boolean
    /** A problem found before running: an unset variable, an unknown table, … */
    error: string | null
}

export interface CompiledPipeline {
    /** The name every step uses for the rows flowing through the pipeline. */
    sourceAlias: string
    steps: CompiledStep[]
    /** Rows after step `index`; -1 is the source table itself. */
    query(index: number, options?: { limit?: number }): BoundSql
    count(index: number): BoundSql
    /** Readable SQL for step `index` (default: last) with variable values inlined. */
    display(index?: number): string
}

// ─── Fragments ────────────────────────────────────────────────────────────────

/** SQL text with `?` placeholders and the values bound to them, in order. */
interface Fragment {
    text: string
    params: unknown[]
    /** Same text with values inlined, for display only. */
    display: string
}

function fragment(text: string): Fragment {
    return { text, params: [], display: text }
}

function join(parts: Fragment[], separator = ''): Fragment {
    return {
        text: parts.map((part) => part.text).join(separator),
        params: parts.flatMap((part) => part.params),
        display: parts.map((part) => part.display).join(separator),
    }
}

class MissingVariableError extends Error {}

/**
 * Turns user SQL text into a fragment: `:name` becomes a bound parameter. String literals,
 * quoted identifiers and comments are skipped, so `'10:30'` stays text.
 */
function bindUserSql(
    text: string,
    variables: Record<string, string>,
    dialect: PipelineSqlDialect,
    keepMissing = false,
): Fragment {
    let out = ''
    let display = ''
    const params: unknown[] = []
    let i = 0
    while (i < text.length) {
        const char = text[i]
        const next = text[i + 1]
        let end = -1
        if (char === "'" || char === '"' || char === '`') {
            end = i + 1
            while (end < text.length) {
                if (text[end] === char) {
                    if (text[end + 1] === char) {
                        end += 2
                        continue
                    }
                    break
                }
                if (text[end] === '\\' && dialect === 'mysql' && char === "'") end++
                end++
            }
            end = Math.min(end + 1, text.length)
        } else if (char === '-' && next === '-') {
            end = text.indexOf('\n', i)
            if (end === -1) end = text.length
        } else if (char === '/' && next === '*') {
            end = text.indexOf('*/', i + 2)
            end = end === -1 ? text.length : end + 2
        }
        if (end !== -1) {
            out += text.slice(i, end)
            display += text.slice(i, end)
            i = end
            continue
        }
        if (char === ':' && next !== ':' && text[i - 1] !== ':') {
            const match = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(text.slice(i + 1))
            if (match) {
                const name = match[0]
                const value = variables[name]
                if (value === undefined && keepMissing) {
                    out += `:${name}`
                    display += `:${name}`
                    i += name.length + 1
                    continue
                }
                if (value === undefined) throw new MissingVariableError(`Set a value for :${name}`)
                const bound = coerceVariable(value)
                params.push(bound)
                out += '?'
                display += typeof bound === 'number' ? String(bound) : `'${bound.replaceAll("'", "''")}'`
                i += name.length + 1
                continue
            }
        }
        out += char
        display += char
        i++
    }
    return { text: out, params, display }
}

/** Numbers stay numbers, so `LIMIT :n` and `price > :min` compare numerically. */
function coerceVariable(value: string): string | number {
    const trimmed = value.trim()
    return /^-?\d+(\.\d+)?$/.test(trimmed) && Number.isFinite(Number(trimmed)) ? Number(trimmed) : value
}

/** Finds variable names the same way the compiler binds them. */
export function findVariables(text: string): string[] {
    const found = new Set<string>()
    const collector = new Proxy({} as Record<string, string>, {
        get: (_, name: string) => {
            found.add(name)
            return ''
        },
    })
    bindUserSql(text, collector, 'mysql')
    return [...found]
}

// ─── Columns ──────────────────────────────────────────────────────────────────

function shortName(qualified: string): string {
    const parts = qualified.split('.')
    return parts[parts.length - 1] || qualified
}

/** The name a database gives a projected expression: an alias, a bare column, or the text itself. */
function projectedName(expr: string, alias: string | undefined): string {
    if (alias?.trim()) return alias.trim()
    const match = /^(?:[`"]?[\w$]+[`"]?\.)?[`"]?([\w$]+)[`"]?$/.exec(expr.trim())
    return match ? match[1] : expr.trim()
}

function uniqueName(name: string, taken: Set<string>): string {
    let candidate = name
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name}_${n}`
    taken.add(candidate.toLowerCase())
    return candidate
}

// ─── Compiler ─────────────────────────────────────────────────────────────────

interface Relation {
    /** CTE (or quoted table) to read from. */
    from: string
    columns: string[] | null
    ordering: SortColumn[] | null
}

interface StepOutput {
    body: Fragment
    columns: string[] | null
    ordering: SortColumn[] | null
    isNoop: boolean
    /** Extra CTEs this step needs before its own (subpipelines). */
    ctes?: Fragment[]
}

class Compiler {
    private readonly quote: (name: string) => string

    constructor(
        private readonly dialect: PipelineSqlDialect,
        private readonly variables: Record<string, string>,
        private readonly schema: PipelineSchema | undefined,
        private readonly keepMissingVariables: boolean,
    ) {
        this.quote = (name) => quoteIdentifier(name, dialect)
    }

    user(text: string): Fragment {
        return bindUserSql(text, this.variables, this.dialect, this.keepMissingVariables)
    }

    /** Compiles `steps` reading from `source`, naming CTEs `${prefix}_1..n`. */
    chain(
        sourceTable: string,
        sourceColumns: string[] | null,
        steps: PipelineStep[],
        prefix: string,
        alias: string,
    ): { ctes: Fragment[]; ends: number[]; compiled: CompiledStep[]; outputs: Relation[] } {
        const ctes: Fragment[] = [
            fragment(`${prefix}_1 AS (SELECT * FROM ${quoteQualifiedIdentifier(sourceTable, this.dialect)})`),
        ]
        const ends: number[] = []
        const compiled: CompiledStep[] = []
        const outputs: Relation[] = []
        let current: Relation = { from: `${prefix}_1`, columns: sourceColumns, ordering: null }

        steps.forEach((step, index) => {
            const name = `${prefix}_${index + 2}`
            let output: StepOutput
            let error: string | null = null
            try {
                output = this.step(step, current, alias, name)
            } catch (caught) {
                error = caught instanceof Error ? caught.message : String(caught)
                output = this.passthrough(current, alias)
            }
            ctes.push(...(output.ctes ?? []))
            ctes.push(join([fragment(`${name} AS (`), output.body, fragment(')')]))
            ends.push(ctes.length)
            compiled.push({
                stepId: step.id,
                inputColumns: current.columns,
                columns: output.columns,
                isNoop: output.isNoop && error === null,
                error,
            })
            current = { from: name, columns: output.columns, ordering: output.ordering }
            outputs.push(current)
        })
        return { ctes, ends, compiled, outputs }
    }

    private passthrough(input: Relation, alias: string): StepOutput {
        return {
            body: fragment(`SELECT * FROM ${input.from} AS ${this.quote(alias)}`),
            columns: input.columns,
            ordering: input.ordering,
            isNoop: true,
        }
    }

    /**
     * Columns picked from chips are quoted identifiers, and SQLite reads an unknown quoted
     * identifier as a string literal. A GROUP BY moved above the JOIN that supplied its column
     * would silently return one bogus group, so fail the step instead.
     */
    private requireColumns(input: Relation, names: string[]): void {
        if (!input.columns) return
        const available = new Set(input.columns.map((column) => column.toLowerCase()))
        const missing = names.find((name) => !available.has(name.toLowerCase()))
        if (missing) throw new Error(`Column "${missing}" isn't available at this step`)
    }

    private step(step: PipelineStep, input: Relation, alias: string, name: string): StepOutput {
        const from = `FROM ${input.from} AS ${this.quote(alias)}`
        switch (step.type) {
            case 'WHERE': {
                if (!step.expression.trim()) return this.passthrough(input, alias)
                return {
                    body: join([fragment(`SELECT * ${from} WHERE `), this.user(step.expression)]),
                    columns: input.columns,
                    ordering: input.ordering,
                    isNoop: false,
                }
            }
            case 'SELECT': {
                const selected = step.columns.filter((column) => column.expr.trim())
                if (selected.length === 0) return this.passthrough(input, alias)
                const expressions = selected.map((column) =>
                    column.alias?.trim()
                        ? join([this.user(column.expr), fragment(` AS ${this.quote(column.alias.trim())}`)])
                        : this.user(column.expr),
                )
                const columns = selected.some((column) => /(^|\.)\s*\*$/.test(column.expr.trim()))
                    ? null
                    : selected.map((column) => projectedName(column.expr, column.alias))
                const keepsOrder =
                    columns !== null && input.ordering?.every((sort) => columns.includes(sort.name)) === true
                return {
                    body: join([fragment('SELECT '), join(expressions, ', '), fragment(` ${from}`)]),
                    columns,
                    ordering: keepsOrder ? input.ordering : null,
                    isNoop: false,
                }
            }
            case 'ORDER_BY': {
                const sorts = step.columns.filter((column) => column.name)
                this.requireColumns(
                    input,
                    sorts.map((sort) => sort.name),
                )
                const limit = step.limit === null ? null : Math.max(0, Math.floor(step.limit))
                if (sorts.length === 0 && limit === null) return this.passthrough(input, alias)
                let sql = `SELECT * ${from}`
                if (sorts.length > 0) sql += ` ORDER BY ${this.orderBy(sorts)}`
                if (limit !== null) sql += ` LIMIT ${limit}`
                return {
                    body: fragment(sql),
                    columns: input.columns,
                    ordering: sorts.length > 0 ? sorts : input.ordering,
                    isNoop: false,
                }
            }
            case 'GROUP_BY': {
                if (step.groupBy.length === 0) return this.passthrough(input, alias)
                this.requireColumns(input, step.groupBy)
                const keys = step.groupBy.map(this.quote).join(', ')
                const aggregations = step.aggregations
                    .filter((aggregation) => aggregation.expr.trim())
                    .map((aggregation) => ({
                        alias: aggregation.alias.trim() || aggregation.fn.toLowerCase(),
                        sql: join([
                            fragment(`${aggregation.fn}(`),
                            this.user(aggregation.expr),
                            fragment(`) AS ${this.quote(aggregation.alias.trim() || aggregation.fn.toLowerCase())}`),
                        ]),
                    }))
                return {
                    body: join([
                        fragment(`SELECT ${keys}`),
                        ...aggregations.map((aggregation) => join([fragment(', '), aggregation.sql])),
                        fragment(` ${from} GROUP BY ${keys}`),
                    ]),
                    columns: [...step.groupBy, ...aggregations.map((aggregation) => aggregation.alias)],
                    ordering: null,
                    isNoop: false,
                }
            }
            case 'JOIN':
                return this.joinStep(step, input, alias, name)
            case 'RAW_SQL': {
                const sql = step.sql.trim().replace(/;+$/, '')
                if (!sql) return this.passthrough(input, alias)
                return {
                    body: this.user(sql.replaceAll('{src}', input.from)),
                    columns: null,
                    ordering: null,
                    isNoop: false,
                }
            }
        }
    }

    private joinStep(step: JoinStep, input: Relation, leftAlias: string, name: string): StepOutput {
        const isSub = step.mode === 'subpipeline'
        const table = isSub ? (step.subTable ?? '') : step.table
        if (!table || !step.on.trim()) return this.passthrough(input, leftAlias)
        if (this.dialect === 'mysql' && step.joinType === 'FULL') {
            throw new Error('MySQL has no FULL JOIN. Use LEFT or RIGHT.')
        }

        const rightAlias = step.alias?.trim() || shortName(table)
        if (rightAlias.toLowerCase() === leftAlias.toLowerCase()) {
            throw new Error(`Give the joined ${shortName(table)} an alias, e.g. "${rightAlias}_2"`)
        }

        let rightSource: string
        let rightColumns: string[] | null | undefined
        let ctes: Fragment[] = []
        if (isSub) {
            const subSteps = step.subSteps ?? []
            const sub = this.chain(table, this.schema?.columnsOf(table) ?? null, subSteps, `${name}_sub`, rightAlias)
            const failed = sub.compiled.find((compiled) => compiled.error)
            if (failed) throw new Error(`Subpipeline: ${failed.error}`)
            ctes = sub.ctes
            rightSource = sub.outputs.at(-1)?.from ?? `${name}_sub_1`
            rightColumns = subSteps.length > 0 ? sub.compiled.at(-1)?.columns : this.schema?.columnsOf(table)
        } else {
            rightSource = quoteQualifiedIdentifier(table, this.dialect)
            rightColumns = this.schema?.columnsOf(table)
        }
        if (!rightColumns) throw new Error(`Columns of ${table} are unknown; refresh the schema and try again`)

        // Joined columns keep their names unless the left side already uses them.
        const leftColumns = input.columns
        const taken = new Set((leftColumns ?? []).map((column) => column.toLowerCase()))
        const projected = rightColumns.map((column) => {
            const preferred = leftColumns && !taken.has(column.toLowerCase()) ? column : `${rightAlias}_${column}`
            return { column, as: uniqueName(preferred, taken) }
        })
        const left = this.quote(leftAlias)
        const right = this.quote(rightAlias)
        const projection = [
            `${left}.*`,
            ...projected.map(({ column, as }) => `${right}.${this.quote(column)} AS ${this.quote(as)}`),
        ].join(', ')
        // Pipelines saved before 0.2 referenced the previous step as `step_N`.
        const on = step.on.replace(/\bstep_\d+\./g, `${leftAlias}.`)

        return {
            ctes,
            body: join([
                fragment(
                    `SELECT ${projection} FROM ${input.from} AS ${left} ${step.joinType} JOIN ${rightSource} AS ${right} ON `,
                ),
                this.user(on),
            ]),
            columns: leftColumns ? [...leftColumns, ...projected.map(({ as }) => as)] : null,
            ordering: null,
            isNoop: false,
        }
    }

    orderBy(sorts: SortColumn[]): string {
        return sorts.map((sort) => `${this.quote(sort.name)} ${sort.direction === 'DESC' ? 'DESC' : 'ASC'}`).join(', ')
    }
}

export function compilePipeline(
    tableName: string,
    steps: PipelineStep[],
    options: CompilePipelineOptions = {},
): CompiledPipeline {
    const dialect = options.dialect ?? 'sqlite'
    const compiler = new Compiler(
        dialect,
        options.variables ?? {},
        options.schema,
        options.keepMissingVariables ?? false,
    )
    const sourceAlias = shortName(tableName)
    const source = quoteQualifiedIdentifier(tableName, dialect)
    const { ctes, ends, compiled, outputs } = compiler.chain(
        tableName,
        options.sourceColumns ?? options.schema?.columnsOf(tableName) ?? null,
        steps,
        'step',
        sourceAlias,
    )

    const build = (index: number, select: (from: string, ordering: SortColumn[] | null) => string): Fragment => {
        if (index < 0) return fragment(select(source, null))
        const relation = outputs[index]
        const withClause = join(ctes.slice(0, ends[index]), ',\n     ')
        return join([fragment('WITH '), withClause, fragment(`\n${select(relation.from, relation.ordering)}`)])
    }
    const rows = (index: number, limit?: number) =>
        build(index, (from, ordering) => {
            let sql = `SELECT * FROM ${from}`
            if (ordering?.length) sql += ` ORDER BY ${compiler.orderBy(ordering)}`
            if (limit !== undefined) sql += ` LIMIT ${Math.max(0, Math.floor(limit))}`
            return sql
        })
    const last = steps.length - 1

    return {
        sourceAlias,
        steps: compiled,
        query: (index, queryOptions = {}) => {
            const built = rows(Math.min(index, last), queryOptions.limit)
            return { sql: built.text, params: built.params }
        },
        count: (index) => {
            const built = build(Math.min(index, last), (from) => `SELECT COUNT(*) AS count FROM ${from}`)
            return { sql: built.text, params: built.params }
        },
        display: (index = last) => rows(Math.min(index, last)).display,
    }
}

/** Readable SQL for a whole pipeline, with variable values inlined. */
export function buildPipelineSql(
    tableName: string,
    steps: PipelineStep[],
    vars: Record<string, string> = {},
    dialect: PipelineSqlDialect = 'sqlite',
    schema?: PipelineSchema,
): string {
    return compilePipeline(tableName, steps, { dialect, variables: vars, schema, keepMissingVariables: true }).display()
}

/**
 * Guesses a join condition from naming conventions (`orders.customer_id = customers.id`), so
 * picking a table usually yields a working JOIN without typing. Returns '' when unsure.
 */
export function suggestJoinOn(left: string, leftColumns: string[], right: string, rightColumns: string[]): string {
    const singular = (name: string) => name.replace(/ies$/, 'y').replace(/s$/, '')
    const has = (columns: string[], name: string) => columns.some((column) => column.toLowerCase() === name)
    const rightKey = `${singular(right).toLowerCase()}_id`
    if (has(leftColumns, rightKey) && has(rightColumns, 'id')) return `${left}.${rightKey} = ${right}.id`
    const leftKey = `${singular(left).toLowerCase()}_id`
    if (has(rightColumns, leftKey) && has(leftColumns, 'id')) return `${left}.id = ${right}.${leftKey}`
    return ''
}
