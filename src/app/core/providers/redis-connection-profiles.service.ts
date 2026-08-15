import { Injectable } from '@angular/core'
import type { RedisConnectionProfile, RedisConnectionProfileDraft } from './redis-connection-profile'

const STORAGE_KEY = 'quarry_redis_connection_profiles'

@Injectable({ providedIn: 'root' })
export class RedisConnectionProfilesService {
    load(): RedisConnectionProfile[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (!raw) return []
            const parsed: unknown = JSON.parse(raw)
            if (!Array.isArray(parsed)) return []
            const profiles = parsed.filter((profile): profile is RedisConnectionProfile => this.isProfile(profile))
            this.persist(profiles)
            return profiles
        } catch {
            return []
        }
    }

    find(id: string): RedisConnectionProfile | null {
        return this.load().find((profile) => profile.id === id) ?? null
    }

    create(draft: RedisConnectionProfileDraft, now = Date.now()): RedisConnectionProfile {
        return {
            id: crypto.randomUUID(),
            name: draft.name,
            host: draft.host,
            port: draft.port,
            database: draft.database,
            username: draft.username || undefined,
            tls: draft.tls,
            rememberPassword: draft.rememberPassword,
            createdAt: now,
            updatedAt: now,
        }
    }

    upsert(profile: RedisConnectionProfile): void {
        this.persist([profile, ...this.load().filter((existing) => existing.id !== profile.id)])
    }

    remove(id: string): void {
        this.persist(this.load().filter((profile) => profile.id !== id))
    }

    private persist(profiles: RedisConnectionProfile[]): void {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
    }

    private isProfile(value: unknown): value is RedisConnectionProfile {
        if (!value || typeof value !== 'object') return false
        const profile = value as Partial<RedisConnectionProfile>
        return (
            typeof profile.id === 'string' &&
            typeof profile.name === 'string' &&
            typeof profile.host === 'string' &&
            Number.isInteger(profile.port) &&
            Number.isInteger(profile.database) &&
            typeof profile.tls === 'boolean' &&
            Number.isFinite(profile.createdAt) &&
            Number.isFinite(profile.updatedAt)
        )
    }
}
