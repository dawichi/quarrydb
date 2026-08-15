import { Injectable, inject, signal } from '@angular/core'
import type { RedisConnectionSession, RedisKeyDetails } from '../providers/redis-backend-adapter'
import { RedisBackendAdapterService } from '../providers/redis-backend-adapter.service'
import { describeSafeError } from '../services/safe-error'

@Injectable({ providedIn: 'root' })
export class RedisWorkspaceStore {
    private readonly backend = inject(RedisBackendAdapterService)

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

    setSession(session: RedisConnectionSession): void {
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
        if (!session || this.isLoadingKeys()) return
        this.isLoadingKeys.set(true)
        this.error.set(null)
        try {
            const result = await this.backend.scanKeys(session, reset ? 0 : this.cursor(), this.pattern())
            const existing = reset ? [] : this.keys()
            const keys = [...new Set([...existing, ...result.keys.map((item) => item.key)])].sort((a, b) =>
                a.localeCompare(b),
            )
            this.keys.set(keys)
            this.cursor.set(result.cursor)
        } catch (error) {
            this.error.set(this.describeError(error))
        } finally {
            this.isLoadingKeys.set(false)
        }
    }

    setPattern(pattern: string): void {
        this.pattern.set(pattern.trim() || '*')
        void this.loadKeys(true)
    }

    async selectKey(key: string): Promise<void> {
        const session = this.connectionSession()
        if (!session || this.isLoadingKey()) return
        this.selectedKey.set(key)
        this.isLoadingKey.set(true)
        this.error.set(null)
        try {
            this.keyDetails.set(await this.backend.getKey(session, key))
        } catch (error) {
            this.error.set(this.describeError(error))
        } finally {
            this.isLoadingKey.set(false)
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

    clear(): void {
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
