import { invoke } from '@tauri-apps/api/core'
import { toRecords } from './sql-records'

export { toRecords, uniqueColumnNames } from './sql-records'

/** Where a native SQL connection points. Mirrors `SqlTarget` in `src-tauri/src/sql/target.rs`. */
export type SqlTarget =
    | { engine: 'sqlite'; path: string; create?: boolean }
    | {
          engine: 'mysql'
          connectionId: string
          host: string
          port: number
          username: string
          password: string
          database?: string
          sslMode?: 'disabled' | 'preferred' | 'required'
      }

export interface SqlRows {
    columns: string[]
    rows: unknown[][]
    truncated: boolean
    durationMs: number
}

export interface SqlStatement {
    sql: string
    params?: unknown[]
    /** Fail the batch (rolling it back) when the statement affects no rows. */
    expectRows?: boolean
}

export interface SqlExecResult {
    rowsAffected: number
    lastInsertId: number | null
}

export interface SqlBatchOptions {
    /** Default `true`: all statements commit together or not at all. */
    transactional?: boolean
    /** Non-transactional batches only: cleanup run on the same connection after a failure. */
    onError?: SqlStatement[]
}

/**
 * One open connection pool in the native layer. Pools are shared by handle, so opening the
 * same SQLite file twice is cheap; `close()` releases the pool for everyone using it.
 */
export interface SqlClient {
    readonly handle: string
    query(sql: string, params?: unknown[], maxRows?: number): Promise<SqlRows>
    /** Rows as objects; `T` is the array type, as with the old plugin API. */
    select<T = Record<string, unknown>[]>(sql: string, params?: unknown[], maxRows?: number): Promise<T>
    execute(sql: string, params?: unknown[]): Promise<SqlExecResult>
    batch(statements: SqlStatement[], options?: SqlBatchOptions): Promise<SqlExecResult[]>
    close(): Promise<void>
}

class NativeSqlClient implements SqlClient {
    constructor(readonly handle: string) {}

    query(sql: string, params: unknown[] = [], maxRows?: number): Promise<SqlRows> {
        return invoke<SqlRows>('sql_select', { handle: this.handle, sql, params, maxRows })
    }

    async select<T = Record<string, unknown>[]>(sql: string, params: unknown[] = [], maxRows?: number): Promise<T> {
        return toRecords(await this.query(sql, params, maxRows)) as T
    }

    async execute(sql: string, params: unknown[] = []): Promise<SqlExecResult> {
        const [result] = await this.batch([{ sql, params }], { transactional: false })
        return result
    }

    batch(statements: SqlStatement[], options: SqlBatchOptions = {}): Promise<SqlExecResult[]> {
        return invoke<SqlExecResult[]>('sql_execute', {
            handle: this.handle,
            statements,
            transactional: options.transactional ?? true,
            onError: options.onError ?? [],
        })
    }

    close(): Promise<void> {
        return invoke('sql_disconnect', { handle: this.handle })
    }
}

export async function connectSql(target: SqlTarget): Promise<SqlClient> {
    const handle = await invoke<string>('sql_connect', { target })
    return new NativeSqlClient(handle)
}
