import type { MysqlConnectionTarget } from '@quarrydb/shared/mysql-connection-target'
import type { MysqlConnectionProfile } from './mysql-connection-profile'
import type { MysqlWorkspaceDraftSource } from './mysql-workspace-draft'

export interface MysqlConnectRequest {
    target: MysqlConnectionTarget
    username: string
    password: string
    sslMode: MysqlConnectionProfile['sslMode']
    source: MysqlWorkspaceDraftSource
}

export function createMysqlConnectRequest(
    profile: MysqlConnectionProfile,
    source: MysqlWorkspaceDraftSource,
): MysqlConnectRequest {
    return {
        target: {
            connectionId: profile.id,
            connectionName: profile.name,
            host: profile.host,
            port: profile.port,
            defaultDatabase: profile.defaultDatabase,
        },
        username: profile.username,
        password: profile.password ?? '',
        sslMode: profile.sslMode,
        source,
    }
}
