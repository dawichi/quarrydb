import type { QueryResult } from '@tauri-apps/plugin-sql'

type SqlParam = null | number | bigint | string | Uint8Array

interface SqliteStatement {
    all(...params: SqlParam[]): unknown[]
    run(...params: SqlParam[]): { changes: number | bigint; lastInsertRowid: number | bigint }
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
 * `FakeDatabase.load("sqlite://<path>")` resolves to it exactly like SqliteDatabaseService
 * resolves real on-disk databases. Re-seeding the same path replaces (and closes) the
 * previous instance, giving each test a clean slate.
 */
export async function seedFixtureDb(path: string, setupSql: string): Promise<string> {
    const key = `sqlite://${path}`
    fixtures.get(key)?.close()

    const { DatabaseSync } = (await import('node:sqlite')) as unknown as NodeSqliteModule
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    db.exec(setupSql)
    fixtures.set(key, db)
    return path
}

export function closeFixtureDbs(): void {
    for (const db of fixtures.values()) db.close()
    fixtures.clear()
}

/**
 * Stand-in for `@tauri-apps/plugin-sql`'s default `Database` export, backed by a real
 * SQLite engine instead of Tauri's IPC bridge. This lets SqliteDatabaseService run its actual
 * SQL — transactions, constraints, CTEs, pragmas — against real SQLite semantics, which
 * is what an integration test needs to be worth writing.
 */
export class FakeDatabase {
    private constructor(private readonly db: SqliteDatabase) {}

    static async load(path: string): Promise<FakeDatabase> {
        const db = fixtures.get(path)
        if (!db) throw new Error(`No fixture seeded for "${path}" — call seedFixtureDb() first`)
        return new FakeDatabase(db)
    }

    async select<T>(sql: string, args: unknown[] = []): Promise<T> {
        return this.db.prepare(sql).all(...(args as SqlParam[])) as T
    }

    async execute(sql: string, args: unknown[] = []): Promise<QueryResult> {
        const info = this.db.prepare(sql).run(...(args as SqlParam[]))
        return { rowsAffected: Number(info.changes), lastInsertId: Number(info.lastInsertRowid) }
    }

    async close(): Promise<boolean> {
        return true
    }
}
