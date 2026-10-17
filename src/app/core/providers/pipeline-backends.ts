import type { DatabaseSchema } from '@quarrydb/shared'
import type { SqliteDatabaseService } from '../services/sqlite-database.service'
import { columnsFromTables, type PipelineBackend, type PipelineTable } from '../store/pipeline-backend'
import type { MysqlConnectionSession, MysqlTableSummary } from './mysql-backend-adapter'
import type { MysqlBackendAdapterService } from './mysql-backend-adapter.service'

/** Pipelines over one SQLite file. `schema` is read lazily, so reloads show up in joins. */
export function sqlitePipelineBackend(
    db: SqliteDatabaseService,
    path: string,
    alias: string,
    schema: () => DatabaseSchema | undefined,
): PipelineBackend {
    const tables = (): PipelineTable[] =>
        (schema()?.tables ?? []).map((table) => ({
            name: table.name,
            label: table.name,
            columns: table.columns.map((column) => column.name),
        }))
    return {
        key: path,
        label: alias,
        dialect: 'sqlite',
        tables,
        columnsOf: (name) => columnsFromTables(tables(), name),
        run: (query, maxRows) => db.runBound(path, query.sql, query.params, maxRows),
        count: (query) => db.countBound(path, query.sql, query.params),
    }
}

/** Pipelines over one MySQL schema; tables are named `schema.table` so queries stay qualified. */
export function mysqlPipelineBackend(
    adapter: MysqlBackendAdapterService,
    session: MysqlConnectionSession,
    schemaName: string,
    summaries: () => MysqlTableSummary[],
): PipelineBackend {
    const tables = (): PipelineTable[] =>
        summaries().map((table) => ({
            name: `${table.schemaName}.${table.name}`,
            label: table.name,
            columns: table.columns.map((column) => column.name),
        }))
    return {
        key: `mysql:${session.target.connectionId}`,
        label: schemaName,
        dialect: 'mysql',
        tables,
        columnsOf: (name) => columnsFromTables(tables(), name),
        run: (query, maxRows) => adapter.runBound(session, query.sql, query.params, maxRows),
        count: (query) => adapter.countBound(session, query.sql, query.params),
    }
}
