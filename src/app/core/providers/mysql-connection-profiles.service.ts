import { Injectable } from '@angular/core'
import type { MysqlConnectionProfile, MysqlConnectionProfileDraft } from './mysql-connection-profile'

const STORAGE_KEY = 'quarry_mysql_connection_profiles'

@Injectable({ providedIn: 'root' })
export class MysqlConnectionProfilesService {
    load(): MysqlConnectionProfile[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (!raw) return []
            const profiles = (JSON.parse(raw) as Array<MysqlConnectionProfile & { password?: string }>).map(
                ({ password: _password, ...profile }) => profile,
            )
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
}
