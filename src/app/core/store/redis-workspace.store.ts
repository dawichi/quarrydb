import { Injectable, inject, signal } from '@angular/core'
import type {
    RedisCollectionKind,
    RedisCollectionOperation,
    RedisConnectionSession,
    RedisKeyDetails,
} from '../providers/redis-backend-adapter'
import { RedisBackendAdapterService } from '../providers/redis-backend-adapter.service'
import { serializeRedisKeyspace } from '../providers/redis-export'
import { ExportService } from '../services/export.service'
import { describeSafeError } from '../services/safe-error'

@Injectable({ providedIn: 'root' })
export class RedisWorkspaceStore {
    private readonly backend = inject(RedisBackendAdapterService)
    private readonly exportService = inject(ExportService)

    readonly connectionSession = signal<RedisConnectionSession | null>(null)
    readonly keys = signal<string[]>([])
    readonly selectedKey = signal<string | null>(null)
    readonly keyDetails = signal<RedisKeyDetails | null>(null)
    readonly cursor = signal(0)
    readonly pattern = signal('*')
    readonly isLoadingKeys = signal(false)
    readonly isLoadingKey = signal(false)
    readonly isMutating = signal(false)
    readonly error = signal<string | null>(null)
    readonly commandOutput = signal<unknown>(null)
    private keyScanRequestId = 0
    private keyDetailsRequestId = 0

    setSession(session: RedisConnectionSession): void {
        this.keyScanRequestId += 1
        this.keyDetailsRequestId += 1
        this.connectionSession.set(session)
        this.keys.set([])
        this.cursor.set(0)
        this.selectedKey.set(null)
        this.keyDetails.set(null)
        this.error.set(null)
        void this.loadKeys(true)
    }

    async loadKeys(reset = false): Promise<void> {
        const session = this.connectionSession()
        if (!session || (!reset && this.isLoadingKeys())) return
        const requestId = ++this.keyScanRequestId
        const requestPattern = this.pattern()
        this.isLoadingKeys.set(true)
        this.error.set(null)
        try {
            const result = await this.backend.scanKeys(session, reset ? 0 : this.cursor(), requestPattern)
            if (
                requestId !== this.keyScanRequestId ||
                session !== this.connectionSession() ||
                requestPattern !== this.pattern()
            ) {
                return
            }
            const existing = reset ? [] : this.keys()
            const keys = [...new Set([...existing, ...result.keys.map((item) => item.key)])].sort((a, b) =>
                a.localeCompare(b),
            )
            this.keys.set(keys)
            this.cursor.set(result.cursor)
        } catch (error) {
            if (requestId !== this.keyScanRequestId || session !== this.connectionSession()) return
            this.error.set(this.describeError(error))
        } finally {
            if (requestId === this.keyScanRequestId) this.isLoadingKeys.set(false)
        }
    }

    setPattern(pattern: string): void {
        this.pattern.set(pattern.trim() || '*')
        void this.loadKeys(true)
    }

    async selectKey(key: string): Promise<void> {
        const session = this.connectionSession()
        if (!session) return
        const requestId = ++this.keyDetailsRequestId
        this.selectedKey.set(key)
        this.isLoadingKey.set(true)
        this.error.set(null)
        try {
            const details = await this.backend.getKey(session, key)
            if (
                requestId !== this.keyDetailsRequestId ||
                session !== this.connectionSession() ||
                key !== this.selectedKey()
            ) {
                return
            }
            this.keyDetails.set(details)
        } catch (error) {
            if (
                requestId !== this.keyDetailsRequestId ||
                session !== this.connectionSession() ||
                key !== this.selectedKey()
            ) {
                return
            }
            this.error.set(this.describeError(error))
        } finally {
            if (requestId === this.keyDetailsRequestId) this.isLoadingKey.set(false)
        }
    }

    async setString(key: string, value: string, ttlMs: number | null): Promise<void> {
        const session = this.connectionSession()
        if (!session || this.isMutating()) return
        this.isMutating.set(true)
        this.error.set(null)
        try {
            await this.backend.setString(session, key, value, ttlMs)
            await this.selectKey(key)
            if (!this.keys().includes(key))
                this.keys.update((keys) => [...keys, key].sort((a, b) => a.localeCompare(b)))
        } catch (error) {
            this.error.set(this.describeError(error))
        } finally {
            this.isMutating.set(false)
        }
    }

    async deleteSelectedKey(): Promise<void> {
        const session = this.connectionSession()
        const key = this.selectedKey()
        if (!session || !key || this.isMutating()) return
        this.isMutating.set(true)
        this.error.set(null)
        try {
            await this.backend.deleteKey(session, key)
            this.keys.update((keys) => keys.filter((candidate) => candidate !== key))
            this.selectedKey.set(null)
            this.keyDetails.set(null)
        } catch (error) {
            this.error.set(this.describeError(error))
        } finally {
            this.isMutating.set(false)
        }
    }

    async runCommand(args: string[]): Promise<void> {
        const session = this.connectionSession()
        if (!session || args.length === 0 || this.isMutating()) return
        this.isMutating.set(true)
        this.error.set(null)
        try {
            this.commandOutput.set(await this.backend.runCommand(session, args))
        } catch (error) {
            this.error.set(this.describeError(error))
        } finally {
            this.isMutating.set(false)
        }
    }

    async exportKeyspace(maxKeys = 500): Promise<void> {
        const session = this.connectionSession()
        if (!session || this.isMutating()) return
        this.isMutating.set(true)
        this.error.set(null)
        try {
            const details = await this.backend.exportKeyspace(session, this.pattern(), maxKeys)
            await this.exportService.saveFile(serializeRedisKeyspace(details), 'redis-keyspace.json', 'json')
        } catch (error) {
            this.error.set(this.describeError(error))
        } finally {
            this.isMutating.set(false)
        }
    }

    async mutateCollection(
        kind: RedisCollectionKind,
        operation: RedisCollectionOperation,
        field: string | null,
        value: string | null,
        score: number | null,
    ): Promise<void> {
        const session = this.connectionSession()
        const key = this.selectedKey()
        if (!session || !key || this.isMutating()) return
        this.isMutating.set(true)
        this.error.set(null)
        try {
            await this.backend.mutateCollection(session, key, kind, operation, field, value, score)
            await this.selectKey(key)
        } catch (error) {
            this.error.set(this.describeError(error))
        } finally {
            this.isMutating.set(false)
        }
    }

    clear(): void {
        this.keyScanRequestId += 1
        this.keyDetailsRequestId += 1
        this.isLoadingKeys.set(false)
        this.isLoadingKey.set(false)
        this.isMutating.set(false)
        this.connectionSession.set(null)
        this.keys.set([])
        this.selectedKey.set(null)
        this.keyDetails.set(null)
        this.cursor.set(0)
        this.error.set(null)
        this.commandOutput.set(null)
    }

    private describeError(error: unknown): string {
        return describeSafeError(error, 'Unknown Redis error')
    }
}
