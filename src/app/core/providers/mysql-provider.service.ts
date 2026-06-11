import { Injectable, inject } from '@angular/core'
import type { MysqlConnectionProfile, MysqlConnectionProfileDraft } from './mysql-connection-profile'
import { MysqlConnectionProfilesService } from './mysql-connection-profiles.service'
import type { HomeLaunchAction } from './provider-definition'

@Injectable({ providedIn: 'root' })
export class MysqlProviderService {
    private readonly profiles = inject(MysqlConnectionProfilesService)

    readonly homeLaunchAction: HomeLaunchAction = {
        id: 'mysql-preview',
        status: 'planned',
        name: 'MySQL',
        description: 'Connect to a saved MySQL server profile once the second provider lands.',
        icon: 'mysql-server',
        openLabel: 'Connect to MySQL',
        openHint: 'Planned provider: saved connections, browse, and raw SQL.',
        badgeLabel: 'Planned',
        availabilityNote: 'MySQL support is not shipped yet.',
    }

    createDraft(): MysqlConnectionProfileDraft {
        return {
            name: '',
            host: 'localhost',
            port: 3306,
            username: '',
            sslMode: 'preferred',
        }
    }

    loadProfiles(): MysqlConnectionProfile[] {
        return this.profiles.load()
    }

    saveDraft(draft: MysqlConnectionProfileDraft, now = Date.now()): MysqlConnectionProfile {
        const profile = this.profiles.create(
            {
                name: draft.name.trim(),
                host: draft.host.trim(),
                port: draft.port,
                username: draft.username.trim(),
                defaultDatabase: draft.defaultDatabase?.trim() || undefined,
                color: draft.color,
                sslMode: draft.sslMode,
            },
            now,
        )
        this.profiles.upsert(profile)
        return profile
    }

    removeProfile(id: string): void {
        this.profiles.remove(id)
    }

    formatProfileSubtitle(profile: MysqlConnectionProfile): string {
        const target = `${profile.host}:${profile.port}`
        return profile.defaultDatabase ? `${target} · ${profile.defaultDatabase}` : target
    }
}
