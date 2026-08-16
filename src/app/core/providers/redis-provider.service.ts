import { Injectable, inject, signal } from '@angular/core'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { RedisPersistedSession } from '@quarrydb/shared/session'
import { RecentItemsService } from '../services/recent-items.service'
import { describeSafeError } from '../services/safe-error'
import { RedisWorkspaceStore } from '../store/redis-workspace.store'
import { WorkspaceHostStore } from '../store/workspace-host.store'
import type { HomeLaunchAction, ProviderDefinition } from './provider-definition'
import type { RedisConnectRequest } from './redis-backend-adapter'
import { RedisBackendAdapterService } from './redis-backend-adapter.service'
import {
    createRedisConnectionTarget,
    type RedisConnectionProfile,
    type RedisConnectionProfileDraft,
} from './redis-connection-profile'
import { RedisConnectionProfilesService } from './redis-connection-profiles.service'
import { RedisConnectionSecretsService } from './redis-connection-secrets.service'
import { createRedisWorkspaceDraft, type RedisWorkspaceDraft } from './redis-workspace-draft'

@Injectable({ providedIn: 'root' })
export class RedisProviderService implements ProviderDefinition<RedisPersistedSession> {
    private readonly backend = inject(RedisBackendAdapterService)
    private readonly profiles = inject(RedisConnectionProfilesService)
    private readonly secrets = inject(RedisConnectionSecretsService)
    private readonly recentItems = inject(RecentItemsService)
    private readonly workspace = inject(RedisWorkspaceStore)
    private readonly host = inject(WorkspaceHostStore)

    readonly workspaceDraft = signal<RedisWorkspaceDraft | null>(null)
    readonly connectPassword = signal('')
    readonly secretStorageWarning = signal<string | null>(null)
    readonly id = 'redis' as const
    readonly kind = 'key-value' as const
    readonly capabilities = [
        'recent_items',
        'server_connection',
        'key_value_browser',
        'key_value_editor',
        'redis_command_runner',
        'export_results',
    ] as const
    readonly launchAction = {
        id: 'redis' as const,
        name: 'Redis',
        description: 'Browse keyspaces, inspect typed values, edit strings, and run Redis commands.',
        icon: 'redis-server' as const,
        openLabel: 'Connect to Redis',
        openHint: 'Local and remote Redis/Valkey servers are supported.',
    }
    readonly availability = {
        canOpenFromHome: true,
        canOpenRecentItems: true,
        canRestoreSession: true,
    }
    readonly homeLaunchAction: HomeLaunchAction = {
        ...this.launchAction,
        status: 'available',
        badgeLabel: 'Redis',
    }

    createDraft(): RedisConnectionProfileDraft {
        return {
            name: '',
            host: 'localhost',
            port: 6379,
            database: 0,
            username: '',
            password: '',
            tls: false,
            rememberPassword: false,
        }
    }

    loadProfiles(): RedisConnectionProfile[] {
        return this.profiles.load()
    }

    async openFromHome(): Promise<void> {
        const draft = this.createDraft()
        this.workspaceDraft.set(
            createRedisWorkspaceDraft(
                {
                    connectionId: 'redis-manual',
                    connectionName: 'Redis connection',
                    host: draft.host,
                    port: draft.port,
                    database: draft.database,
                    tls: draft.tls,
                },
                'manual',
            ),
        )
        this.connectPassword.set('')
        this.host.error.set(null)
        this.host.setWorkspaceOpen('redis')
    }

    async openSample(): Promise<void> {
        await this.openFromHome()
    }

    async openRecentItem(item: RecentItem): Promise<void> {
        if (item.providerId !== 'redis') throw new Error(`Redis provider cannot open ${item.providerId} recent items`)
        this.workspaceDraft.set(createRedisWorkspaceDraft(item.resource, 'recent_item'))
        this.host.setWorkspaceOpen('redis')
        const password = await this.secrets.loadRemembered(item.resource.connectionId)
        this.connectPassword.set(password ?? this.secrets.get(item.resource.connectionId))
        if (this.connectPassword()) await this.connectWorkspaceDraft()
    }

    async restoreSession(session: RedisPersistedSession): Promise<void> {
        if (session.providerId !== 'redis') throw new Error(`Redis provider cannot restore ${session.providerId}`)
        this.workspaceDraft.set({
            target: session.workspace,
            source: 'session_restore',
            selectedKey: session.workspace.selectedKey ?? null,
            keyPattern: session.workspace.keyPattern ?? '*',
            activeTab: session.workspace.activeTab ?? 'keys',
        })
        this.host.setWorkspaceOpen('redis')
        const password = await this.secrets.loadRemembered(session.workspace.connectionId)
        this.connectPassword.set(password ?? '')
        this.host.error.set('Redis connection restored. Connect again to reopen the keyspace.')
    }

    saveDraft(draft: RedisConnectionProfileDraft, now = Date.now()): RedisConnectionProfile {
        const profile = this.profiles.create(
            {
                ...draft,
                name: draft.name.trim(),
                host: draft.host.trim(),
                username: draft.username.trim(),
                password: draft.password,
            },
            now,
        )
        this.profiles.upsert(profile)
        this.secrets.set(profile.id, draft.password)
        this.secretStorageWarning.set(null)
        if (profile.rememberPassword) {
            void this.secrets.remember(profile.id, draft.password).then((stored) => {
                if (!stored)
                    this.secretStorageWarning.set(
                        'Secure password storage is unavailable; the password will be forgotten when Quarry closes.',
                    )
            })
        } else {
            void this.secrets.deletePersisted(profile.id)
        }
        this.recentItems.add(this.recentItems.createRedisItem(profile, now))
        this.selectProfile(profile.id)
        return profile
    }

    removeProfile(id: string): void {
        this.profiles.remove(id)
        this.secrets.forget(id)
        this.recentItems.remove(`redis:${id}`)
    }

    selectProfile(id: string): boolean {
        const profile = this.profiles.find(id)
        if (!profile) return false
        this.workspaceDraft.set(createRedisWorkspaceDraft(createRedisConnectionTarget(profile), 'saved_profile'))
        this.connectPassword.set(this.secrets.get(id))
        void this.secrets.loadRemembered(id).then((password) => {
            if (password !== null) this.connectPassword.set(password)
        })
        this.host.setWorkspaceOpen('redis')
        return true
    }

    setConnectPassword(password: string): void {
        this.connectPassword.set(password)
        const draft = this.workspaceDraft()
        if (draft) this.secrets.set(draft.target.connectionId, password)
    }

    async connectWorkspaceDraft(): Promise<void> {
        const request = this.buildConnectRequest()
        if (!request) {
            this.host.error.set('Enter a Redis host, valid port, and password when the server requires one.')
            return
        }
        this.host.isLoading.set(true)
        this.host.error.set(null)
        try {
            const session = await this.backend.connect(request)
            this.workspace.setSession(session)
            this.host.setWorkspaceOpen('redis')
        } catch (error) {
            this.host.error.set(describeSafeError(error, 'Unknown Redis connection error'))
        } finally {
            this.host.isLoading.set(false)
        }
    }

    buildConnectRequest(): RedisConnectRequest | null {
        const draft = this.workspaceDraft()
        if (
            !draft?.target.host.trim() ||
            !Number.isInteger(draft.target.port) ||
            draft.target.port < 1 ||
            draft.target.port > 65535 ||
            !Number.isInteger(draft.target.database) ||
            draft.target.database < 0 ||
            draft.target.database > 255
        )
            return null
        return { target: draft.target, password: this.connectPassword(), source: draft.source }
    }

    async connectDraft(draft: RedisConnectionProfileDraft): Promise<void> {
        const target = {
            connectionId: 'redis-manual',
            connectionName: draft.name.trim() || 'Redis connection',
            host: draft.host.trim(),
            port: draft.port,
            database: draft.database,
            username: draft.username.trim() || undefined,
            tls: draft.tls,
        }
        this.workspaceDraft.set(createRedisWorkspaceDraft(target, 'manual'))
        this.setConnectPassword(draft.password)
        await this.connectWorkspaceDraft()
    }

    buildActiveSession(savedAt = Date.now()): RedisPersistedSession | null {
        const session = this.workspace.connectionSession()
        if (!session) return null
        return {
            version: 1,
            providerId: 'redis',
            savedAt,
            workspace: {
                ...session.target,
                selectedKey: this.workspace.selectedKey(),
                keyPattern: this.workspace.pattern(),
                activeTab: this.workspaceDraft()?.activeTab ?? 'keys',
            },
        }
    }

    clearWorkspace(): void {
        this.workspaceDraft.set(null)
        this.connectPassword.set('')
        this.workspace.clear()
    }
}
