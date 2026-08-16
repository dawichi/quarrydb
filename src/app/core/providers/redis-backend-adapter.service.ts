import { Injectable } from '@angular/core'
import type { RedisConnectionTarget } from '@quarrydb/shared/redis-connection-target'
import { invoke } from '@tauri-apps/api/core'
import type {
    RedisBackendAdapter,
    RedisCollectionKind,
    RedisCollectionOperation,
    RedisConnectionSession,
    RedisConnectRequest,
    RedisKeyDetails,
    RedisScanResult,
} from './redis-backend-adapter'

interface NativeRedisTarget extends RedisConnectionTarget {
    password: string
}

interface NativeRedisConnectionInfo {
    server_version: string | null
    database_size: number
}

interface NativeRedisScanResult {
    cursor: number
    keys: string[]
}

interface NativeRedisKeyDetails {
    key: string
    kind: string
    ttl_ms: number
    value: unknown
    value_truncated?: boolean
}

@Injectable({ providedIn: 'root' })
export class RedisBackendAdapterService implements RedisBackendAdapter {
    async connect(request: RedisConnectRequest): Promise<RedisConnectionSession> {
        const info = await invoke<NativeRedisConnectionInfo>('redis_connect', {
            target: this.nativeTarget(request),
        })
        return {
            target: request.target,
            password: request.password,
            source: request.source,
            connectedAt: Date.now(),
            serverVersion: info.server_version,
            databaseSize: info.database_size,
        }
    }

    async scanKeys(
        session: RedisConnectionSession,
        cursor: number,
        pattern: string,
        count = 100,
    ): Promise<RedisScanResult> {
        const result = await invoke<NativeRedisScanResult>('redis_scan_keys', {
            target: this.nativeTargetFromSession(session),
            cursor,
            pattern: pattern.trim() || null,
            count,
        })
        return { cursor: result.cursor, keys: result.keys.map((key) => ({ key })) }
    }

    async getKey(session: RedisConnectionSession, key: string): Promise<RedisKeyDetails> {
        const details = await invoke<NativeRedisKeyDetails>('redis_get_key', {
            target: this.nativeTargetFromSession(session),
            key,
        })
        return this.mapKeyDetails(details)
    }

    async exportKeyspace(session: RedisConnectionSession, pattern: string, maxKeys = 500): Promise<RedisKeyDetails[]> {
        const details = await invoke<NativeRedisKeyDetails[]>('redis_export_keyspace', {
            target: this.nativeTargetFromSession(session),
            pattern: pattern.trim() || null,
            maxKeys,
        })
        return details.map((item) => this.mapKeyDetails(item))
    }

    async mutateCollection(
        session: RedisConnectionSession,
        key: string,
        kind: RedisCollectionKind,
        operation: RedisCollectionOperation,
        field: string | null,
        value: string | null,
        score: number | null,
    ): Promise<number> {
        return invoke<number>('redis_mutate_collection', {
            target: this.nativeTargetFromSession(session),
            key,
            kind,
            operation,
            field,
            value,
            score,
        })
    }

    async setString(session: RedisConnectionSession, key: string, value: string, ttlMs: number | null): Promise<void> {
        await invoke('redis_set_string', {
            target: this.nativeTargetFromSession(session),
            key,
            value,
            ttlMs,
        })
    }

    async deleteKey(session: RedisConnectionSession, key: string): Promise<number> {
        return invoke<number>('redis_delete_key', {
            target: this.nativeTargetFromSession(session),
            key,
        })
    }

    async runCommand(session: RedisConnectionSession, args: string[]): Promise<unknown> {
        return invoke('redis_run_command', {
            target: this.nativeTargetFromSession(session),
            args,
        })
    }

    private nativeTarget(request: RedisConnectRequest): NativeRedisTarget {
        return { ...request.target, password: request.password }
    }

    private nativeTargetFromSession(session: RedisConnectionSession): NativeRedisTarget {
        // The provider service attaches the runtime password to the target only while invoking
        // native work. Persisted targets never contain this field.
        return { ...session.target, password: session.password }
    }

    private mapKeyDetails(details: NativeRedisKeyDetails): RedisKeyDetails {
        return {
            key: details.key,
            kind: details.kind,
            ttlMs: details.ttl_ms,
            value: details.value,
            ...(details.value_truncated ? { valueTruncated: true } : {}),
        }
    }
}
