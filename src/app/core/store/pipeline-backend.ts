import type { BoundSql, PipelineSchema, PipelineSqlDialect } from '@quarrydb/shared/pipeline-sql'

/** A table a pipeline can read or join, named the way steps refer to it. */
export interface PipelineTable {
    name: string
    label: string
    columns: string[]
}

export interface PipelineRows {
    rows: Record<string, unknown>[]
    columns: string[]
}

/**
 * What the pipeline needs from a database. Each SQL provider supplies one, so the pipeline
 * store and UI stay engine-agnostic.
 */
export interface PipelineBackend extends PipelineSchema {
    /** Identity of the database (a SQLite path, or `mysql:<connection id>`). */
    readonly key: string
    /** Short label for the database, e.g. the SQLite alias or the MySQL schema. */
    readonly label: string
    readonly dialect: PipelineSqlDialect
    tables(): PipelineTable[]
    run(query: BoundSql, maxRows?: number): Promise<PipelineRows>
    count(query: BoundSql): Promise<number>
}

export interface PipelineTarget {
    backend: PipelineBackend
    tableName: string
    columns: string[]
}

/** Column lookup shared by backends: tables may be named bare or schema-qualified. */
export function columnsFromTables(tables: PipelineTable[], name: string): string[] | undefined {
    const exact = tables.find((table) => table.name === name)
    if (exact) return exact.columns
    const short = name.split('.').at(-1)
    return tables.find((table) => table.name.split('.').at(-1) === short)?.columns
}
