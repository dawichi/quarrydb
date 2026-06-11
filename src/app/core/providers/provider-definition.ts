import type { ProviderId } from '@quarrydb/shared/provider'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { PersistedSession } from '@quarrydb/shared/session'

export interface ProviderLaunchAction {
    id: ProviderId
    name: string
    description: string
    icon: 'sqlite-file' | 'mysql-server'
    openLabel: string
    openHint?: string
    sampleLabel?: string
}

export type HomeLaunchAction =
    | (ProviderLaunchAction & {
          status: 'available'
          badgeLabel?: string
      })
    | {
          id: 'mysql-preview'
          status: 'planned'
          name: 'MySQL'
          description: string
          icon: 'mysql-server'
          openLabel: 'Connect to MySQL'
          openHint?: string
          badgeLabel: 'Planned'
          availabilityNote: string
      }

export interface ProviderAvailability {
    canOpenFromHome: boolean
    canOpenRecentItems: boolean
    canRestoreSession: boolean
    unavailableMessage?: string
}

export interface ProviderDefinition<TSession extends PersistedSession = PersistedSession> {
    id: ProviderId
    launchAction: ProviderLaunchAction
    availability: ProviderAvailability
    openFromHome(): Promise<void>
    openSample(): Promise<void>
    openRecentItem(item: RecentItem): Promise<void>
    restoreSession(session: TSession): Promise<void>
}
