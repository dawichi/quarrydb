import type { MysqlConnectionTarget } from '@quarrydb/shared/mysql-connection-target'

export interface MysqlConnectionProfile {
    id: string
    name: string
    host: string
    port: number
    username: string
    defaultDatabase?: string
    rememberPassword?: boolean
    color?: string
    sslMode?: 'disabled' | 'preferred' | 'required'
    createdAt: number
    updatedAt: number
}

export interface MysqlConnectionProfileDraft {
    name: string
    host: string
    port: number
    username: string
    password: string
    defaultDatabase?: string
    rememberPassword?: boolean
    color?: string
    sslMode?: 'disabled' | 'preferred' | 'required'
}

export function createMysqlConnectionTarget(profile: MysqlConnectionProfile): MysqlConnectionTarget {
    return {
        connectionId: profile.id,
        connectionName: profile.name,
        host: profile.host,
        port: profile.port,
        defaultDatabase: profile.defaultDatabase,
    }
}
