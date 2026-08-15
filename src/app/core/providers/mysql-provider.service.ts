import { Injectable, inject, signal } from '@angular/core'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { MysqlPersistedSession } from '@quarrydb/shared/session'
import { RecentItemsService } from '../services/recent-items.service'
import { describeSafeError } from '../services/safe-error'
import { MysqlPipelineStore } from '../store/mysql-pipeline.store'
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
import { MysqlConnectionSecretsService } from './mysql-connection-secrets.service'
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
    private readonly secrets = inject(MysqlConnectionSecretsService)
    private readonly recentItems = inject(RecentItemsService)
    private readonly workspace = inject(MysqlWorkspaceStore)
    private readonly pipeline = inject(MysqlPipelineStore)
    private readonly host = inject(WorkspaceHostStore)
    readonly workspaceDraft = signal<MysqlWorkspaceDraft | null>(null)
    readonly connectionSession = signal<MysqlConnectionSession | null>(null)
    readonly schemaSummaries = signal<MysqlSchemaSummary[] | null>(null)
    readonly schemaBootstrapError = signal<string | null>(null)
    readonly connectPassword = signal('')
    readonly secretStorageWarning = signal<string | null>(null)
    private pendingPipeline: MysqlPersistedSession['pipeline'] | null = null

    readonly id = 'mysql' as const
    readonly kind = 'relational' as const
    readonly capabilities = [
        'recent_items',
        'server_connection',
        'relational_schema_browser',
        'sql_query_runner',
        'export_results',
        'row_editor',
        'visual_sql_pipeline',
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
        description: 'MySQL provider: saved profiles, schema browsing, row editing, exports, and raw SQL.',
        icon: 'mysql-server',
        openLabel: 'Connect to MySQL',
        openHint: 'Preview provider: saved connections, browse, and raw SQL.',
        badgeLabel: 'Preview',
        availabilityNote:
            'Preview quality: browse, stage row edits, export results, run raw SQL, and build MySQL visual pipelines.',
    }

    createDraft(): MysqlConnectionProfileDraft {
        return {
            name: '',
            host: 'localhost',
            port: 3306,
            username: '',
            password: '',
            rememberPassword: false,
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
        if (this.hasPasswordForWorkspaceDraft()) {
            await this.connectWorkspaceDraft()
            return
        }
        this.host.error.set('Enter the MySQL password to reconnect to this saved profile.')
    }

    async restoreSession(session: MysqlPersistedSession): Promise<void> {
        if (session.providerId !== 'mysql') {
            throw new Error(`MySQL provider cannot restore session for provider ${session.providerId}`)
        }
        this.workspaceDraft.set(createMysqlWorkspaceDraftFromSession(session))
        this.pendingPipeline = session.pipeline
        this.syncDraftPassword(session.workspace.connectionId)
        this.host.error.set('MySQL connection restored. Re-enter the password below to reopen the workspace.')
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
                rememberPassword: draft.rememberPassword,
                color: draft.color,
                sslMode: draft.sslMode,
            },
            now,
        )
        this.profiles.upsert(profile)
        this.secrets.set(profile.id, draft.password)
        this.secretStorageWarning.set(null)
        if (profile.rememberPassword) {
            void this.secrets.remember(profile.id, draft.password).then((stored) => {
                if (!stored) {
                    this.secretStorageWarning.set(
                        'Secure password storage is unavailable; this password will be forgotten when Quarry closes.',
                    )
                }
            })
        } else {
            void this.secrets.deletePersisted(profile.id)
        }
        this.recentItems.add(this.recentItems.createMysqlItem(profile, now))
        this.workspaceDraft.set(this.createWorkspaceDraftFromProfile(profile))
        this.syncDraftPassword(profile.id)
        return profile
    }

    removeProfile(id: string): void {
        this.profiles.remove(id)
        void this.secrets.forget(id)
        this.recentItems.remove(`mysql:${id}`)
        if (this.workspaceDraft()?.target.connectionId === id) {
            this.workspaceDraft.set(null)
            this.connectPassword.set('')
        }
        if (this.connectionSession()?.target.connectionId === id) {
            this.connectionSession.set(null)
            this.schemaSummaries.set(null)
            this.pipeline.clear()
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
        this.syncDraftPassword(profile.id)
        return true
    }

    clearWorkspaceDraft(): void {
        this.workspaceDraft.set(null)
        this.pendingPipeline = null
        this.connectionSession.set(null)
        this.schemaSummaries.set(null)
        this.schemaBootstrapError.set(null)
        this.connectPassword.set('')
        this.pipeline.clear()
        this.workspace.clear()
    }

    setConnectPassword(password: string): void {
        this.connectPassword.set(password)

        const draft = this.workspaceDraft()
        if (!draft) {
            return
        }

        this.secrets.set(draft.target.connectionId, password)
    }

    hasPasswordForWorkspaceDraft(): boolean {
        const draft = this.workspaceDraft()
        if (!draft) {
            return false
        }

        return !!this.resolvePassword(draft.target.connectionId)
    }

    buildConnectRequestFromWorkspaceDraft(): MysqlConnectRequest | null {
        const draft = this.workspaceDraft()
        if (!draft) return null

        const profile = this.profiles.find(draft.target.connectionId)
        if (!profile) return null
        const password = this.resolvePassword(draft.target.connectionId)
        if (!password) return null

        return createMysqlConnectRequest(profile, password, draft.source)
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
        this.schemaBootstrapError.set(null)
        try {
            const session = await this.backend.connect(request)
            this.connectionSession.set(session)
            let schemas: MysqlSchemaSummary[]
            try {
                schemas = await this.backend.listSchemas(session)
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to load MySQL schemas'
                this.schemaBootstrapError.set(message)

                const fallbackSchema = request.target.defaultDatabase
                if (!fallbackSchema) {
                    throw error
                }

                schemas = [{ name: fallbackSchema, isDefault: true }]
            }
            this.schemaSummaries.set(schemas)
            await this.workspace.openWorkspace(session, schemas, this.workspaceDraft())
            this.restorePendingPipeline(session)
        } catch (error) {
            throw this.notAvailableYet(this.describeError(error))
        } finally {
            this.host.isLoading.set(false)
        }
    }

    previewRecentItem(item: RecentItem): boolean {
        if (item.providerId !== 'mysql') {
            throw new Error(`MySQL provider cannot preview recent item for provider ${item.providerId}`)
        }
        this.workspaceDraft.set(createMysqlWorkspaceDraftFromRecentItem(item))
        this.syncDraftPassword(item.resource.connectionId)
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

    private restorePendingPipeline(session: MysqlConnectionSession): void {
        const pending = this.pendingPipeline
        this.pendingPipeline = null
        if (!pending?.source || pending.source.connectionId !== session.target.connectionId) return
        this.pipeline.openForTable(session, pending.source.schemaName, pending.source.tableName, pending.source.columns)
        this.pipeline.restoreState(pending.steps, pending.variableValues)
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
                source: this.pipeline.source(),
                steps: this.pipeline.steps(),
                variableValues: this.pipeline.variableValues(),
            },
        }
    }

    private notAvailableYet(message = 'MySQL provider is not available yet'): Error {
        const error = new Error(message)
        this.host.error.set(error.message)
        return error
    }

    private describeError(error: unknown): string {
        return describeSafeError(error, 'Unknown MySQL error')
    }

    private createWorkspaceDraftFromProfile(profile: MysqlConnectionProfile) {
        return createMysqlWorkspaceDraft(createMysqlConnectionTarget(profile), 'saved_profile')
    }

    private resolvePassword(connectionId: string): string | null {
        const runtimePassword = this.connectPassword().trim()
        if (this.workspaceDraft()?.target.connectionId === connectionId && runtimePassword) {
            return runtimePassword
        }

        return this.secrets.get(connectionId)
    }

    private syncDraftPassword(connectionId: string): void {
        this.connectPassword.set(this.secrets.get(connectionId) ?? '')
        const profile = this.profiles.find(connectionId)
        if (profile?.rememberPassword && !this.connectPassword()) {
            void this.secrets.load(connectionId).then((password) => {
                if (this.workspaceDraft()?.target.connectionId === connectionId) {
                    this.connectPassword.set(password ?? '')
                }
            })
        }
    }
}
