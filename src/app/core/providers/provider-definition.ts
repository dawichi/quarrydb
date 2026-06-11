import type { ProviderId } from '@quarrydb/shared/provider'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { PersistedSession } from '@quarrydb/shared/session'

export interface ProviderLaunchAction {
    id: ProviderId
    name: string
    description: string
    icon: 'sqlite-file'
    openLabel: string
    openHint?: string
    sampleLabel?: string
}

export interface ProviderDefinition<TSession extends PersistedSession = PersistedSession> {
    id: ProviderId
    launchAction: ProviderLaunchAction
    openFromHome(): Promise<void>
    openSample(): Promise<void>
    openRecentItem(item: RecentItem): Promise<void>
    restoreSession(session: TSession): Promise<void>
}
