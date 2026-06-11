import { Injectable, inject } from '@angular/core'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { MysqlPersistedSession } from '@quarrydb/shared/session'
import { RecentItemsService } from '../services/recent-items.service'
import { WorkspaceHostStore } from '../store/workspace-host.store'
import {
    createMysqlConnectionTarget,
    type MysqlConnectionProfile,
    type MysqlConnectionProfileDraft,
} from './mysql-connection-profile'
import { MysqlConnectionProfilesService } from './mysql-connection-profiles.service'
import type { HomeLaunchAction, ProviderDefinition } from './provider-definition'

@Injectable({ providedIn: 'root' })
export class MysqlProviderService implements ProviderDefinition<MysqlPersistedSession> {
    private readonly profiles = inject(MysqlConnectionProfilesService)
    private readonly recentItems = inject(RecentItemsService)
    private readonly host = inject(WorkspaceHostStore)

    readonly id = 'mysql' as const
    readonly kind = 'relational' as const
    readonly capabilities = [
        'recent_items',
        'server_connection',
        'relational_schema_browser',
        'sql_query_runner',
    ] as const
    readonly launchAction = {
        id: 'mysql' as const,
        name: 'MySQL',
        description: 'Connect to a saved MySQL server profile once the second provider lands.',
        icon: 'mysql-server' as const,
        openLabel: 'Connect to MySQL',
        openHint: 'Saved profile flow is in progress.',
    }
    readonly availability = {
        canOpenFromHome: false,
        canOpenRecentItems: false,
        canRestoreSession: false,
        unavailableMessage: 'Saved MySQL profiles are local metadata only until the provider backend lands.',
    }

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

    async openFromHome(): Promise<void> {
        throw this.notAvailableYet()
    }

    async openSample(): Promise<void> {
        throw this.notAvailableYet()
    }

    async openRecentItem(item: RecentItem): Promise<void> {
        if (item.providerId !== 'mysql') {
            throw new Error(`MySQL provider cannot open recent item for provider ${item.providerId}`)
        }
        throw this.notAvailableYet()
    }

    async restoreSession(session: MysqlPersistedSession): Promise<void> {
        if (session.providerId !== 'mysql') {
            throw new Error(`MySQL provider cannot restore session for provider ${session.providerId}`)
        }
        throw this.notAvailableYet()
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
        this.recentItems.add(this.recentItems.createMysqlItem(profile, now))
        return profile
    }

    removeProfile(id: string): void {
        this.profiles.remove(id)
        this.recentItems.remove(`mysql:${id}`)
    }

    formatProfileSubtitle(profile: MysqlConnectionProfile): string {
        const target = `${profile.host}:${profile.port}`
        return profile.defaultDatabase ? `${target} · ${profile.defaultDatabase}` : target
    }

    buildPersistedSession(
        profile: MysqlConnectionProfile,
        savedAt = Date.now(),
        selectedTable?: MysqlPersistedSession['workspace']['selectedTable'],
    ): MysqlPersistedSession {
        return {
            version: 1,
            providerId: 'mysql',
            savedAt,
            workspace: {
                ...createMysqlConnectionTarget(profile),
                selectedTable: selectedTable ?? null,
                activeTab: 'browse',
            },
            pipeline: {
                source: null,
                steps: [],
                variableValues: {},
            },
        }
    }

    private notAvailableYet(): Error {
        const error = new Error('MySQL provider is not available yet')
        this.host.error.set(error.message)
        return error
    }
}
