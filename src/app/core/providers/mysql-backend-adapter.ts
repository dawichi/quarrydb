import type { MysqlConnectionTarget } from '@quarrydb/shared/mysql-connection-target'
import type { MysqlConnectRequest } from './mysql-connect-request'

export interface MysqlConnectionSession {
    target: MysqlConnectionTarget
    source: MysqlConnectRequest['source']
    connectedAt: number
}

export interface MysqlSchemaSummary {
    name: string
    isDefault: boolean
}

export interface MysqlBackendAdapter {
    connect(request: MysqlConnectRequest): Promise<MysqlConnectionSession>
    listSchemas(session: MysqlConnectionSession): Promise<MysqlSchemaSummary[]>
}
