import { Injectable, inject } from '@angular/core'
import type { ProviderId } from '@quarrydb/shared/provider'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { PersistedSession } from '@quarrydb/shared/session'
import { SqliteProviderService } from './sqlite-provider.service'

@Injectable({ providedIn: 'root' })
export class ProviderRegistryService {
    private readonly sqliteProvider = inject(SqliteProviderService)

    readonly defaultProviderId: ProviderId = 'sqlite'

    async openFromHome(providerId = this.defaultProviderId): Promise<void> {
        switch (providerId) {
            case 'sqlite':
                await this.sqliteProvider.openFromHome()
                break
        }
    }

    async openSample(providerId = this.defaultProviderId): Promise<void> {
        switch (providerId) {
            case 'sqlite':
                await this.sqliteProvider.openSample()
                break
        }
    }

    async openRecentItem(item: RecentItem): Promise<void> {
        switch (item.providerId) {
            case 'sqlite':
                await this.sqliteProvider.openRecentItem(item)
                break
        }
    }

    async restoreSession(session: PersistedSession): Promise<void> {
        switch (session.providerId) {
            case 'sqlite':
                await this.sqliteProvider.restoreSession(session)
                break
        }
    }
}
