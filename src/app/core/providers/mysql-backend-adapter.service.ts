import { Injectable } from '@angular/core'
import Database from '@tauri-apps/plugin-sql'
import type { MysqlBackendAdapter, MysqlConnectionSession, MysqlSchemaSummary } from './mysql-backend-adapter'
import type { MysqlConnectRequest } from './mysql-connect-request'

@Injectable({ providedIn: 'root' })
export class MysqlBackendAdapterService implements MysqlBackendAdapter {
    private readonly requests = new Map<string, MysqlConnectRequest>()

    async connect(request: MysqlConnectRequest): Promise<MysqlConnectionSession> {
        const db = await Database.load(this.buildDsn(request))
        await db.close()
        this.requests.set(request.target.connectionId, request)
        return {
            target: request.target,
            source: request.source,
            connectedAt: Date.now(),
        }
    }

    async listSchemas(session: MysqlConnectionSession): Promise<MysqlSchemaSummary[]> {
        const request = this.requests.get(session.target.connectionId)
        if (!request) {
            throw new Error(`MySQL connection request not found for ${session.target.connectionName}`)
        }

        const db = await Database.load(this.buildDsn(request))
        try {
            const rows = await db.select<Array<{ name: string }>>(
                'SELECT SCHEMA_NAME as name FROM information_schema.schemata ORDER BY SCHEMA_NAME',
            )
            const defaultSchema = request.target.defaultDatabase
            return rows.map((row) => ({
                name: row.name,
                isDefault: defaultSchema ? row.name === defaultSchema : false,
            }))
        } finally {
            await db.close()
        }
    }

    private buildDsn(request: MysqlConnectRequest): string {
        const username = encodeURIComponent(request.username)
        const password = encodeURIComponent(request.password)
        const host = request.target.host
        const port = request.target.port
        const database = request.target.defaultDatabase ? `/${encodeURIComponent(request.target.defaultDatabase)}` : ''
        return `mysql://${username}:${password}@${host}:${port}${database}`
    }
}
