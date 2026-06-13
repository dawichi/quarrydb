import { Injectable, inject, signal } from '@angular/core'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { MysqlPersistedSession } from '@quarrydb/shared/session'
import { RecentItemsService } from '../services/recent-items.service'
import { MysqlWorkspaceStore } from '../store/mysql-workspace.store'
import { WorkspaceHostStore } from '../store/workspace-host.store'
import type { MysqlConnectionSession, MysqlSchemaSummary } from './mysql-backend-adapter'
import { MysqlBackendAdapterService } from './mysql-backend-adapter.service'
import { createMysqlConnectRequest, type MysqlConnectRequest } from './mysql-connect-request'
import {
    createMysqlConnectionTarget,
    type MysqlConnectionProfile,
    type MysqlConnectionProfileDraft,
} from './mysql-connection-profile'
import { MysqlConnectionProfilesService } from './mysql-connection-profiles.service'
import {
    createMysqlWorkspaceDraft,
    createMysqlWorkspaceDraftFromRecentItem,
    createMysqlWorkspaceDraftFromSession,
    type MysqlWorkspaceDraft,
} from './mysql-workspace-draft'
import type { HomeLaunchAction, ProviderDefinition } from './provider-definition'

@Injectable({ providedIn: 'root' })
export class MysqlProviderService implements ProviderDefinition<MysqlPersistedSession> {
    private readonly backend = inject(MysqlBackendAdapterService)
    private readonly profiles = inject(MysqlConnectionProfilesService)
    private readonly recentItems = inject(RecentItemsService)
    private readonly workspace = inject(MysqlWorkspaceStore)
    private readonly host = inject(WorkspaceHostStore)
    readonly workspaceDraft = signal<MysqlWorkspaceDraft | null>(null)
    readonly connectionSession = signal<MysqlConnectionSession | null>(null)
    readonly schemaSummaries = signal<MysqlSchemaSummary[] | null>(null)

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
        canOpenRecentItems: true,
        canRestoreSession: true,
    }

    readonly homeLaunchAction: HomeLaunchAction = {
        id: 'mysql-preview',
        status: 'planned',
        name: 'MySQL',
        description: 'Preview provider: saved profiles, schema browsing, row preview, and raw SQL.',
        icon: 'mysql-server',
        openLabel: 'Connect to MySQL',
        openHint: 'Preview provider: saved connections, browse, and raw SQL.',
        badgeLabel: 'Planned',
        availabilityNote:
            'Preview quality: browse tables and run raw SQL; pipeline and edit mode stay SQLite-only for now.',
    }

    createDraft(): MysqlConnectionProfileDraft {
        return {
            name: '',
            host: 'localhost',
            port: 3306,
            username: '',
            password: '',
            sslMode: 'preferred',
        }
    }

    async openFromHome(): Promise<void> {
        await this.connectWorkspaceDraft()
    }

    async openSample(): Promise<void> {
        throw this.notAvailableYet()
    }

    async openRecentItem(item: RecentItem): Promise<void> {
        this.previewRecentItem(item)
        await this.connectWorkspaceDraft()
    }

    async restoreSession(session: MysqlPersistedSession): Promise<void> {
        if (session.providerId !== 'mysql') {
            throw new Error(`MySQL provider cannot restore session for provider ${session.providerId}`)
        }
        this.workspaceDraft.set(createMysqlWorkspaceDraftFromSession(session))
        await this.connectWorkspaceDraft()
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
                password: draft.password.trim(),
                defaultDatabase: draft.defaultDatabase?.trim() || undefined,
                color: draft.color,
                sslMode: draft.sslMode,
            },
            now,
        )
        this.profiles.upsert(profile)
        this.recentItems.add(this.recentItems.createMysqlItem(profile, now))
        this.workspaceDraft.set(this.createWorkspaceDraftFromProfile(profile))
        return profile
    }

    removeProfile(id: string): void {
        this.profiles.remove(id)
        this.recentItems.remove(`mysql:${id}`)
        if (this.workspaceDraft()?.target.connectionId === id) {
            this.workspaceDraft.set(null)
        }
        if (this.connectionSession()?.target.connectionId === id) {
            this.connectionSession.set(null)
            this.schemaSummaries.set(null)
            this.workspace.clear()
        }
    }

    formatProfileSubtitle(profile: MysqlConnectionProfile): string {
        const target = `${profile.host}:${profile.port}`
        return profile.defaultDatabase ? `${target} · ${profile.defaultDatabase}` : target
    }

    selectProfile(id: string): boolean {
        const profile = this.profiles.find(id)
        if (!profile) return false
        this.workspaceDraft.set(this.createWorkspaceDraftFromProfile(profile))
        return true
    }

    clearWorkspaceDraft(): void {
        this.workspaceDraft.set(null)
        this.connectionSession.set(null)
        this.schemaSummaries.set(null)
        this.workspace.clear()
    }

    buildConnectRequestFromWorkspaceDraft(): MysqlConnectRequest | null {
        const draft = this.workspaceDraft()
        if (!draft) return null

        const profile = this.profiles.find(draft.target.connectionId)
        if (!profile) return null

        return createMysqlConnectRequest(profile, draft.source)
    }

    async connectWorkspaceDraft(): Promise<void> {
        const request = this.buildConnectRequestFromWorkspaceDraft()
        if (!request) {
            throw this.notAvailableYet('MySQL connect target is not ready yet')
        }

        this.host.isLoading.set(true)
        this.host.error.set(null)
        this.connectionSession.set(null)
        this.schemaSummaries.set(null)
        try {
            const session = await this.backend.connect(request)
            this.connectionSession.set(session)
            const schemas = await this.backend.listSchemas(session)
            this.schemaSummaries.set(schemas)
            await this.workspace.openWorkspace(session, schemas, this.workspaceDraft())
        } catch (error) {
            throw this.notAvailableYet(error instanceof Error ? error.message : undefined)
        } finally {
            this.host.isLoading.set(false)
        }
    }

    previewRecentItem(item: RecentItem): boolean {
        if (item.providerId !== 'mysql') {
            throw new Error(`MySQL provider cannot preview recent item for provider ${item.providerId}`)
        }
        this.workspaceDraft.set(createMysqlWorkspaceDraftFromRecentItem(item))
        return true
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

    buildActiveSession(savedAt = Date.now()): MysqlPersistedSession | null {
        const session = this.connectionSession()
        if (!session) {
            return null
        }

        return {
            version: 1,
            providerId: 'mysql',
            savedAt,
            workspace: {
                ...session.target,
                selectedTable: this.workspace.selectedTable(),
                activeTab: this.workspace.activeTab(),
            },
            pipeline: {
                source: null,
                steps: [],
                variableValues: {},
            },
        }
    }

    private notAvailableYet(message = 'MySQL provider is not available yet'): Error {
        const error = new Error(message)
        this.host.error.set(error.message)
        return error
    }

    private createWorkspaceDraftFromProfile(profile: MysqlConnectionProfile) {
        return createMysqlWorkspaceDraft(createMysqlConnectionTarget(profile), 'saved_profile')
    }
}
