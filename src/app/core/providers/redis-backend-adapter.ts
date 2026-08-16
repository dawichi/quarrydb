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
    valueTruncated?: boolean
}

export type RedisCollectionKind = 'list' | 'set' | 'zset' | 'hash' | 'stream'

export type RedisCollectionOperation = 'push_left' | 'push_right' | 'add' | 'remove' | 'upsert' | 'set' | 'append'

export interface RedisBackendAdapter {
    connect(request: RedisConnectRequest): Promise<RedisConnectionSession>
    scanKeys(session: RedisConnectionSession, cursor: number, pattern: string, count?: number): Promise<RedisScanResult>
    getKey(session: RedisConnectionSession, key: string): Promise<RedisKeyDetails>
    exportKeyspace(session: RedisConnectionSession, pattern: string, maxKeys?: number): Promise<RedisKeyDetails[]>
    mutateCollection(
        session: RedisConnectionSession,
        key: string,
        kind: RedisCollectionKind,
        operation: RedisCollectionOperation,
        field: string | null,
        value: string | null,
        score: number | null,
    ): Promise<number>
    setString(session: RedisConnectionSession, key: string, value: string, ttlMs: number | null): Promise<void>
    deleteKey(session: RedisConnectionSession, key: string): Promise<number>
    runCommand(session: RedisConnectionSession, args: string[]): Promise<unknown>
}
