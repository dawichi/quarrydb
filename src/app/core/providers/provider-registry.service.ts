import { Injectable, inject } from '@angular/core'
import type { ProviderId } from '@quarrydb/shared/provider'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { PersistedSession } from '@quarrydb/shared/session'
import type { HomeLaunchAction, ProviderDefinition, ProviderLaunchAction } from './provider-definition'
import { SqliteProviderService } from './sqlite-provider.service'

@Injectable({ providedIn: 'root' })
export class ProviderRegistryService {
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
        return this.getProvider(providerId).launchAction.name
    }

    getLaunchActions(): ProviderLaunchAction[] {
        return this.registeredProviders().map((provider) => provider.launchAction)
    }

    getHomeLaunchActions(): HomeLaunchAction[] {
        return [
            ...this.getLaunchActions().map((action) => ({
                ...action,
                status: 'available' as const,
                badgeLabel: action.name,
            })),
            {
                id: 'mysql-preview',
                status: 'planned',
                name: 'MySQL',
                description: 'Connect to a saved MySQL server profile once the second provider lands.',
                icon: 'mysql-server',
                openLabel: 'Connect to MySQL',
                openHint: 'Planned provider: saved connections, browse, and raw SQL.',
                badgeLabel: 'Planned',
                availabilityNote: 'MySQL support is not shipped yet.',
            },
        ]
    }

    private registeredProviders(): ProviderDefinition[] {
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
