import { Injectable, inject } from '@angular/core'
import type { ProviderId } from '@quarrydb/shared/provider'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { PersistedSession } from '@quarrydb/shared/session'
import { MysqlProviderService } from './mysql-provider.service'
import type { HomeLaunchAction, ProviderDefinition, ProviderLaunchAction } from './provider-definition'
import { SqliteProviderService } from './sqlite-provider.service'

@Injectable({ providedIn: 'root' })
export class ProviderRegistryService {
    private readonly mysqlProvider = inject(MysqlProviderService)
    private readonly sqliteProvider = inject(SqliteProviderService)

    readonly defaultProviderId: ProviderId = 'sqlite'

    async openFromHome(providerId = this.defaultProviderId): Promise<void> {
        await this.getProvider(providerId).openFromHome()
    }

    async openSample(providerId = this.defaultProviderId): Promise<void> {
        await this.getProvider(providerId).openSample()
    }

    async openRecentItem(item: RecentItem): Promise<void> {
        await this.getProvider(item.providerId).openRecentItem(item)
    }

    async restoreSession(session: PersistedSession): Promise<void> {
        await this.getProvider(session.providerId).restoreSession(session)
    }

    getProviderLabel(providerId: ProviderId): string {
        return this.getProviderDisplayAction(providerId).name
    }

    getLaunchActions(): ProviderLaunchAction[] {
        return this.availableLaunchProviders().map((provider) => provider.launchAction)
    }

    getHomeLaunchActions(): HomeLaunchAction[] {
        return [
            ...this.getLaunchActions().map((action) => ({
                ...action,
                status: 'available' as const,
                badgeLabel: action.name,
            })),
            this.mysqlProvider.homeLaunchAction,
        ]
    }

    getProviderDisplayAction(providerId: ProviderId): HomeLaunchAction {
        switch (providerId) {
            case 'sqlite':
                return { ...this.sqliteProvider.launchAction, status: 'available', badgeLabel: 'SQLite' }
            case 'mysql':
                return this.mysqlProvider.homeLaunchAction
        }
    }

    private registeredProviders(): ProviderDefinition[] {
        return [this.sqliteProvider, this.mysqlProvider]
    }

    private availableLaunchProviders(): ProviderDefinition[] {
        return [this.sqliteProvider]
    }

    private getProvider(providerId: ProviderId): ProviderDefinition {
        const provider = this.registeredProviders().find((candidate) => candidate.id === providerId)
        if (!provider) {
            throw new Error(`Unknown provider: ${providerId}`)
        }
        return provider
    }
}
