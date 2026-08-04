import { Component, inject, signal } from '@angular/core'
import {
    LucideBookOpen,
    LucideCirclePlus,
    LucideDatabase,
    LucideFolderOpen,
    LucideServer,
    LucideTrash2,
} from '@lucide/angular'
import type { ProviderCapability, ProviderId } from '@quarrydb/shared/provider'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { MysqlConnectionSession, MysqlSchemaSummary } from '../../core/providers/mysql-backend-adapter'
import type { MysqlConnectRequest } from '../../core/providers/mysql-connect-request'
import type { MysqlConnectionProfile, MysqlConnectionProfileDraft } from '../../core/providers/mysql-connection-profile'
import { MysqlProviderService } from '../../core/providers/mysql-provider.service'
import type { MysqlWorkspaceDraft } from '../../core/providers/mysql-workspace-draft'
import { type HomeLaunchAction, PROVIDER_CAPABILITY_LABELS } from '../../core/providers/provider-definition'
import { ProviderRegistryService } from '../../core/providers/provider-registry.service'
import { RecentItemsService } from '../../core/services/recent-items.service'
import { TutorialService } from '../../core/services/tutorial.service'
import { WorkspaceHostStore } from '../../core/store/workspace-host.store'

@Component({
    selector: 'app-welcome',
    host: { class: 'flex-1 min-h-0' },
    imports: [LucideBookOpen, LucideCirclePlus, LucideDatabase, LucideFolderOpen, LucideServer, LucideTrash2],
    templateUrl: './welcome.component.html',
})
export class WelcomeComponent {
    protected readonly mysqlProvider = inject(MysqlProviderService)
    protected readonly workspaceHost = inject(WorkspaceHostStore)
    protected readonly tutorialSvc = inject(TutorialService)
    protected readonly recentItemsSvc = inject(RecentItemsService)
    private readonly providers = inject(ProviderRegistryService)
    protected readonly launchActions = this.providers.getHomeLaunchActions()
    protected readonly mysqlDraft = signal<MysqlConnectionProfileDraft>(this.mysqlProvider.createDraft())
    protected readonly mysqlWorkspaceDraft = this.mysqlProvider.workspaceDraft
    protected readonly mysqlConnectionSession = this.mysqlProvider.connectionSession
    protected readonly mysqlSchemaSummaries = this.mysqlProvider.schemaSummaries
    protected readonly mysqlSchemaBootstrapError = this.mysqlProvider.schemaBootstrapError

    protected get recentItems() {
        return this.recentItemsSvc.load()
    }

    protected openProvider(providerId: ProviderId): void {
        void this.providers.openFromHome(providerId)
    }

    protected openSample(providerId: ProviderId): void {
        void this.providers.openSample(providerId)
    }

    protected reopenRecentItem(item: RecentItem): void {
        if (!this.canReopenRecentItem(item)) {
            if (item.providerId === 'mysql') {
                this.mysqlProvider.previewRecentItem(item)
            }
            return
        }
        void this.providers.openRecentItem(item)
    }

    protected providerAction(providerId: ProviderId): HomeLaunchAction {
        return this.providers.getProviderDisplayAction(providerId)
    }

    protected providerCapabilitiesForAction(action: HomeLaunchAction): ProviderCapability[] {
        return this.providers.getCapabilities(this.providerIdForAction(action))
    }

    protected providerCapabilityLabel(capability: ProviderCapability): string {
        return PROVIDER_CAPABILITY_LABELS[capability]
    }

    protected canReopenRecentItem(item: RecentItem): boolean {
        return this.providers.canOpenRecentItem(item.providerId)
    }

    protected recentItemAvailabilityNote(item: RecentItem): string | null {
        return this.providers.getUnavailableMessage(item.providerId)
    }

    protected isAvailableAction(
        action: HomeLaunchAction,
    ): action is HomeLaunchAction & { status: 'available'; id: ProviderId } {
        return action.status === 'available'
    }

    protected mysqlProfiles(): MysqlConnectionProfile[] {
        return this.mysqlProvider.loadProfiles()
    }

    protected updateMysqlDraft<K extends keyof MysqlConnectionProfileDraft>(
        field: K,
        value: MysqlConnectionProfileDraft[K],
    ): void {
        this.mysqlDraft.update((draft) => ({ ...draft, [field]: value }))
    }

    protected parseMysqlPort(value: string): number {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }

    protected canSaveMysqlDraft(): boolean {
        const draft = this.mysqlDraft()
        return !!draft.name.trim() && !!draft.host.trim() && !!draft.username.trim() && draft.port > 0
    }

    protected saveMysqlDraft(): void {
        if (!this.canSaveMysqlDraft()) return
        this.mysqlProvider.saveDraft(this.mysqlDraft())
        this.mysqlDraft.set(this.mysqlProvider.createDraft())
    }

    protected saveAndConnectMysqlDraft(): void {
        if (!this.canSaveMysqlDraft()) return
        this.mysqlProvider.saveDraft(this.mysqlDraft())
        this.mysqlDraft.set(this.mysqlProvider.createDraft())
        void this.mysqlProvider.connectWorkspaceDraft()
    }

    protected removeMysqlProfile(id: string): void {
        this.mysqlProvider.removeProfile(id)
    }

    protected useMysqlProfile(id: string): void {
        this.mysqlProvider.selectProfile(id)
    }

    protected clearMysqlWorkspaceDraft(): void {
        this.mysqlProvider.clearWorkspaceDraft()
    }

    protected connectMysqlDraft(): void {
        void this.mysqlProvider.connectWorkspaceDraft()
    }

    protected updateMysqlConnectPassword(value: string): void {
        this.mysqlProvider.setConnectPassword(value)
    }

    protected mysqlDraftNeedsPassword(): boolean {
        return !!this.mysqlWorkspaceDraft() && !this.mysqlProvider.hasPasswordForWorkspaceDraft()
    }

    protected canConnectMysqlDraft(): boolean {
        return !!this.mysqlConnectRequest()
    }

    protected mysqlProfileSubtitle(profile: MysqlConnectionProfile): string {
        return this.mysqlProvider.formatProfileSubtitle(profile)
    }

    protected mysqlWorkspaceDraftSourceLabel(draft: MysqlWorkspaceDraft): string {
        switch (draft.source) {
            case 'saved_profile':
                return 'Saved profile'
            case 'recent_item':
                return 'Recent item'
            case 'session_restore':
                return 'Session restore'
        }
    }

    protected mysqlConnectRequest(): MysqlConnectRequest | null {
        return this.mysqlProvider.buildConnectRequestFromWorkspaceDraft()
    }

    protected mysqlConnectionSessionLabel(session: MysqlConnectionSession): string {
        return `${session.target.host}:${session.target.port}`
    }

    protected mysqlDefaultSchemaName(schemas: MysqlSchemaSummary[]): string | null {
        return schemas.find((schema) => schema.isDefault)?.name ?? null
    }

    protected startTutorial(): void {
        this.tutorialSvc.start()
        void this.providers.openSample(this.providers.defaultProviderId)
    }

    private providerIdForAction(action: HomeLaunchAction): ProviderId {
        return action.id === 'mysql-preview' ? 'mysql' : action.id
    }
}
