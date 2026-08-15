import type { RedisConnectionTarget } from '@quarrydb/shared/redis-connection-target'

export interface RedisConnectionProfile {
    id: string
    name: string
    host: string
    port: number
    database: number
    username?: string
    tls: boolean
    rememberPassword?: boolean
    createdAt: number
    updatedAt: number
}

export interface RedisConnectionProfileDraft {
    name: string
    host: string
    port: number
    database: number
    username: string
    password: string
    tls: boolean
    rememberPassword: boolean
}

export function createRedisConnectionTarget(profile: RedisConnectionProfile): RedisConnectionTarget {
    return {
        connectionId: profile.id,
        connectionName: profile.name,
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: profile.username,
        tls: profile.tls,
    }
}
