import type {
    SqlBatchOptions,
    SqlClient,
    SqlExecResult,
    SqlRows,
    SqlStatement,
    SqlTarget,
} from '../../native/sql-client'
import { toRecords } from '../../native/sql-records'

type SqlParam = null | number | bigint | string | Uint8Array

interface SqliteStatement {
    all(...params: SqlParam[]): unknown[]
    run(...params: SqlParam[]): { changes: number | bigint; lastInsertRowid: number | bigint }
    columns(): Array<{ name: string }>
    setReturnArrays(enabled: boolean): void
}

interface SqliteDatabase {
    exec(sql: string): void
    prepare(sql: string): SqliteStatement
    close(): void
}

interface NodeSqliteModule {
    DatabaseSync: new (path: string) => SqliteDatabase
}

const fixtures = new Map<string, SqliteDatabase>()

/**
 * Seeds a real in-memory SQLite database — via Node's built-in `node:sqlite`, no extra
 * dependency needed — and registers it under an app-relative path, so that
 * `connectSql({ engine: 'sqlite', path })` resolves to it exactly like the native layer
 * resolves real on-disk databases. Re-seeding the same path replaces (and closes) the
 * previous instance, giving each test a clean slate.
 */
export async function seedFixtureDb(path: string, setupSql: string): Promise<string> {
    fixtures.get(path)?.close()

    const { DatabaseSync } = (await import('node:sqlite')) as unknown as NodeSqliteModule
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    db.exec(setupSql)
    fixtures.set(path, db)
    return path
}

export function closeFixtureDbs(): void {
    for (const db of fixtures.values()) db.close()
    fixtures.clear()
}

/**
 * Stand-in for the native `SqlClient`, backed by a real SQLite engine instead of Tauri's IPC
 * bridge. Services run their actual SQL — transactions, constraints, CTEs, pragmas — against
 * real SQLite semantics, which is what an integration test needs to be worth writing.
 */
class FakeSqlClient implements SqlClient {
    constructor(
        readonly handle: string,
        private readonly db: SqliteDatabase,
    ) {}

    async query(sql: string, params: unknown[] = [], maxRows?: number): Promise<SqlRows> {
        const statement = this.db.prepare(sql)
        statement.setReturnArrays(true)
        const rows = statement.all(...(params as SqlParam[])) as unknown[][]
        const limit = maxRows ?? rows.length
        return {
            columns: statement.columns().map((column) => column.name),
            rows: rows.slice(0, limit).map((row) => row.map(normalizeValue)),
            truncated: rows.length > limit,
            durationMs: 0,
        }
    }

    async select<T = Record<string, unknown>[]>(sql: string, params: unknown[] = [], maxRows?: number): Promise<T> {
        return toRecords(await this.query(sql, params, maxRows)) as T
    }

    async execute(sql: string, params: unknown[] = []): Promise<SqlExecResult> {
        return this.run({ sql, params })
    }

    async batch(statements: SqlStatement[], options: SqlBatchOptions = {}): Promise<SqlExecResult[]> {
        const transactional = options.transactional ?? true
        if (transactional) this.db.exec('BEGIN')
        const results: SqlExecResult[] = []
        try {
            for (const statement of statements) results.push(this.run(statement))
            if (transactional) this.db.exec('COMMIT')
            return results
        } catch (error) {
            if (transactional) this.db.exec('ROLLBACK')
            for (const cleanup of options.onError ?? []) {
                try {
                    this.run(cleanup)
                } catch {
                    /* cleanup failures are secondary, as in the native layer */
                }
            }
            throw error
        }
    }

    async close(): Promise<void> {}

    private run(statement: SqlStatement): SqlExecResult {
        const params = (statement.params ?? []) as SqlParam[]
        // Multi-statement scripts without parameters run like the native driver runs them.
        if (params.length === 0 && /;\s*\S/.test(statement.sql.trim().replace(/;+$/, ''))) {
            this.db.exec(statement.sql)
            return { rowsAffected: 0, lastInsertId: null }
        }
        const info = this.db.prepare(statement.sql).run(...params)
        if (statement.expectRows && Number(info.changes) === 0) {
            throw new Error('The target row was not found; it may have changed. Refresh and retry.')
        }
        return { rowsAffected: Number(info.changes), lastInsertId: Number(info.lastInsertRowid) }
    }
}

function normalizeValue(value: unknown): unknown {
    return typeof value === 'bigint' ? Number(value) : value
}

/** Drop-in for `connectSql` in tests; see the `vi.mock` calls in the integration specs. */
export async function fakeConnectSql(target: SqlTarget): Promise<SqlClient> {
    if (target.engine !== 'sqlite') throw new Error('The SQLite fixture only serves sqlite targets')
    const db = fixtures.get(target.path)
    if (!db) throw new Error(`No fixture seeded for "${target.path}" — call seedFixtureDb() first`)
    return new FakeSqlClient(`sqlite:${target.path}`, db)
}
