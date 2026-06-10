import { Injectable } from '@angular/core'
import type { RecentItem, SqliteRecentItem } from '@quarrydb/shared/recent-item'

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
            if (raw) return JSON.parse(raw) as RecentItem[]

            const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY)
            if (!legacyRaw) return []

            const migrated = (JSON.parse(legacyRaw) as LegacyRecentFile[]).map((file) =>
                this.createSqliteItem(file.path, file.openedAt),
            )
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

    private createSqliteItemId(path: string): string {
        return `sqlite:${path}`
    }

    private persist(items: RecentItem[]): void {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ENTRIES)))
    }
}
