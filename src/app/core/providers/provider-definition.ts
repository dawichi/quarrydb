import type { ProviderCapability, ProviderId, ProviderKind } from '@quarrydb/shared/provider'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { PersistedSession } from '@quarrydb/shared/session'

export interface ProviderLaunchAction {
    id: ProviderId
    name: string
    description: string
    icon: 'sqlite-file' | 'mysql-server' | 'redis-server'
    openLabel: string
    openHint?: string
    sampleLabel?: string
}

export type HomeLaunchAction = ProviderLaunchAction & {
    status: 'available'
    badgeLabel?: string
}

export interface ProviderAvailability {
    canOpenFromHome: boolean
    canOpenRecentItems: boolean
    canRestoreSession: boolean
    unavailableMessage?: string
}

export const PROVIDER_CAPABILITY_LABELS: Record<ProviderCapability, string> = {
    recent_items: 'Recent items',
    server_connection: 'Server connection',
    relational_schema_browser: 'Schema browser',
    sql_query_runner: 'SQL runner',
    visual_sql_pipeline: 'Visual pipeline',
    row_editor: 'Row editing',
    ddl_manager: 'Schema tools',
    query_history: 'Query history',
    export_results: 'Export',
    key_value_browser: 'Key browser',
    key_value_editor: 'Key editing',
    redis_command_runner: 'Redis commands',
}

export interface ProviderDefinition<TSession extends PersistedSession = PersistedSession> {
    id: ProviderId
    kind: ProviderKind
    capabilities: readonly ProviderCapability[]
    launchAction: ProviderLaunchAction
    availability: ProviderAvailability
    openFromHome(): Promise<void>
    openSample(): Promise<void>
    openRecentItem(item: RecentItem): Promise<void>
    restoreSession(session: TSession): Promise<void>
}
