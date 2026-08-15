import type { RedisConnectionTarget } from '@quarrydb/shared/redis-connection-target'

export interface RedisConnectRequest {
    target: RedisConnectionTarget
    password: string
    source: 'saved_profile' | 'recent_item' | 'session_restore' | 'manual'
}

export interface RedisConnectionSession {
    target: RedisConnectionTarget
    password: string
    source: RedisConnectRequest['source']
    connectedAt: number
    serverVersion: string | null
    databaseSize: number
}

export interface RedisKeySummary {
    key: string
}

export interface RedisScanResult {
    cursor: number
    keys: RedisKeySummary[]
}

export interface RedisKeyDetails {
    key: string
    kind: string
    ttlMs: number
    value: unknown
}

export interface RedisBackendAdapter {
    connect(request: RedisConnectRequest): Promise<RedisConnectionSession>
    scanKeys(session: RedisConnectionSession, cursor: number, pattern: string, count?: number): Promise<RedisScanResult>
    getKey(session: RedisConnectionSession, key: string): Promise<RedisKeyDetails>
    exportKeyspace(session: RedisConnectionSession, pattern: string, maxKeys?: number): Promise<RedisKeyDetails[]>
    setString(session: RedisConnectionSession, key: string, value: string, ttlMs: number | null): Promise<void>
    deleteKey(session: RedisConnectionSession, key: string): Promise<number>
    runCommand(session: RedisConnectionSession, args: string[]): Promise<unknown>
}
