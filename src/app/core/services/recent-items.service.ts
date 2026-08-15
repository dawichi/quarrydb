import { Injectable } from '@angular/core'
import type { MysqlRecentItem, RecentItem, RedisRecentItem, SqliteRecentItem } from '@quarrydb/shared/recent-item'
import { createMysqlConnectionTarget, type MysqlConnectionProfile } from '../providers/mysql-connection-profile'
import { createRedisConnectionTarget, type RedisConnectionProfile } from '../providers/redis-connection-profile'

interface LegacyRecentFile {
    path: string
    name: string
    openedAt: number
}

const STORAGE_KEY = 'quarry_recent_items'
const LEGACY_STORAGE_KEY = 'quarry_recent_files'
const MAX_ENTRIES = 8

@Injectable({ providedIn: 'root' })
export class RecentItemsService {
    load(): RecentItem[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw) {
                const parsed: unknown = JSON.parse(raw)
                const items = Array.isArray(parsed)
                    ? parsed.filter((item): item is RecentItem => this.isRecentItem(item))
                    : []
                this.persist(items)
                return items
            }

            const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY)
            if (!legacyRaw) return []

            const parsedLegacy: unknown = JSON.parse(legacyRaw)
            const migrated = (Array.isArray(parsedLegacy) ? parsedLegacy : [])
                .filter((file): file is LegacyRecentFile => this.isLegacyRecentFile(file))
                .map((file) => this.createSqliteItem(file.path, file.openedAt))
            this.persist(migrated)
            localStorage.removeItem(LEGACY_STORAGE_KEY)
            return migrated
        } catch {
            return []
        }
    }

    add(item: RecentItem): void {
        const all = this.load().filter((existing) => existing.id !== item.id)
        all.unshift(item)
        this.persist(all)
    }

    remove(id: string): void {
        const all = this.load().filter((item) => item.id !== id)
        this.persist(all)
    }

    createSqliteItem(path: string, openedAt = Date.now()): SqliteRecentItem {
        return {
            id: this.createSqliteItemId(path),
            providerId: 'sqlite',
            label: path.split('/').pop() ?? path,
            subtitle: path,
            openedAt,
            resource: { path },
        }
    }

    createMysqlItem(profile: MysqlConnectionProfile, openedAt = Date.now()): MysqlRecentItem {
        return {
            id: this.createMysqlItemId(profile.id),
            providerId: 'mysql',
            label: profile.name,
            subtitle: `${profile.host}:${profile.port}`,
            openedAt,
            resource: createMysqlConnectionTarget(profile),
        }
    }

    createRedisItem(profile: RedisConnectionProfile, openedAt = Date.now()): RedisRecentItem {
        return {
            id: this.createRedisItemId(profile.id),
            providerId: 'redis',
            label: profile.name,
            subtitle: `${profile.host}:${profile.port} · DB ${profile.database}`,
            openedAt,
            resource: createRedisConnectionTarget(profile),
        }
    }

    private createSqliteItemId(path: string): string {
        return `sqlite:${path}`
    }

    private createMysqlItemId(connectionId: string): string {
        return `mysql:${connectionId}`
    }

    private createRedisItemId(connectionId: string): string {
        return `redis:${connectionId}`
    }

    private persist(items: RecentItem[]): void {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ENTRIES)))
    }

    private isRecentItem(value: unknown): value is RecentItem {
        if (!value || typeof value !== 'object') return false
        const item = value as Partial<RecentItem>
        if (
            typeof item.id !== 'string' ||
            typeof item.label !== 'string' ||
            typeof item.providerId !== 'string' ||
            !Number.isFinite(item.openedAt)
        )
            return false
        if (item.providerId === 'sqlite') {
            return !!item.resource && typeof item.resource === 'object' && typeof item.resource.path === 'string'
        }
        if (item.providerId === 'mysql' || item.providerId === 'redis') {
            const resource = item.resource
            return (
                !!resource &&
                typeof resource === 'object' &&
                typeof resource.connectionId === 'string' &&
                typeof resource.connectionName === 'string' &&
                typeof resource.host === 'string' &&
                Number.isInteger(resource.port)
            )
        }
        return false
    }

    private isLegacyRecentFile(value: unknown): value is LegacyRecentFile {
        if (!value || typeof value !== 'object') return false
        const file = value as Partial<LegacyRecentFile>
        return typeof file.path === 'string' && typeof file.name === 'string' && Number.isFinite(file.openedAt)
    }
}
