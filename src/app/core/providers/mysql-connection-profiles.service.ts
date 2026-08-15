import { Injectable } from '@angular/core'
import type { MysqlConnectionProfile, MysqlConnectionProfileDraft } from './mysql-connection-profile'

const STORAGE_KEY = 'quarry_mysql_connection_profiles'

@Injectable({ providedIn: 'root' })
export class MysqlConnectionProfilesService {
    load(): MysqlConnectionProfile[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (!raw) return []
            const parsed: unknown = JSON.parse(raw)
            if (!Array.isArray(parsed)) return []
            const profiles = parsed
                .map((value) => {
                    if (!value || typeof value !== 'object') return null
                    const { password: _password, ...profile } = value as MysqlConnectionProfile & { password?: string }
                    return this.isProfile(profile) ? profile : null
                })
                .filter((profile): profile is MysqlConnectionProfile => profile !== null)
            this.persist(profiles)
            return profiles
        } catch {
            return []
        }
    }

    find(id: string): MysqlConnectionProfile | null {
        return this.load().find((profile) => profile.id === id) ?? null
    }

    create(draft: MysqlConnectionProfileDraft, now = Date.now()): MysqlConnectionProfile {
        return {
            id: crypto.randomUUID(),
            name: draft.name,
            host: draft.host,
            port: draft.port,
            username: draft.username,
            defaultDatabase: draft.defaultDatabase,
            rememberPassword: draft.rememberPassword ?? false,
            color: draft.color,
            sslMode: draft.sslMode,
            createdAt: now,
            updatedAt: now,
        }
    }

    upsert(profile: MysqlConnectionProfile): void {
        const all = this.load().filter((existing) => existing.id !== profile.id)
        all.unshift(profile)
        this.persist(all)
    }

    remove(id: string): void {
        this.persist(this.load().filter((profile) => profile.id !== id))
    }

    private persist(profiles: MysqlConnectionProfile[]): void {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
    }

    private isProfile(value: unknown): value is MysqlConnectionProfile {
        if (!value || typeof value !== 'object') return false
        const profile = value as Partial<MysqlConnectionProfile>
        return (
            typeof profile.id === 'string' &&
            typeof profile.name === 'string' &&
            typeof profile.host === 'string' &&
            Number.isInteger(profile.port) &&
            typeof profile.username === 'string' &&
            Number.isFinite(profile.createdAt) &&
            Number.isFinite(profile.updatedAt)
        )
    }
}
