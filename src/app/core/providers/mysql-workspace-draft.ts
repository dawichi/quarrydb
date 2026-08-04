import type { MysqlConnectionTarget } from '@quarrydb/shared/mysql-connection-target'
import type { MysqlRecentItem } from '@quarrydb/shared/recent-item'
import type { MysqlPersistedSession, MysqlWorkspaceSelection, MysqlWorkspaceTab } from '@quarrydb/shared/session'

export type MysqlWorkspaceDraftSource = 'saved_profile' | 'recent_item' | 'session_restore'

export interface MysqlWorkspaceDraft {
    target: MysqlConnectionTarget
    source: MysqlWorkspaceDraftSource
    selectedTable: MysqlWorkspaceSelection | null
    activeTab: MysqlWorkspaceTab
}

export function createMysqlWorkspaceDraft(
    target: MysqlConnectionTarget,
    source: MysqlWorkspaceDraftSource,
    selectedTable: MysqlWorkspaceSelection | null = null,
    activeTab: MysqlWorkspaceTab = 'browse',
): MysqlWorkspaceDraft {
    return {
        target,
        source,
        selectedTable,
        activeTab,
    }
}

export function createMysqlWorkspaceDraftFromRecentItem(item: MysqlRecentItem): MysqlWorkspaceDraft {
    return createMysqlWorkspaceDraft(item.resource, 'recent_item')
}

export function createMysqlWorkspaceDraftFromSession(session: MysqlPersistedSession): MysqlWorkspaceDraft {
    return createMysqlWorkspaceDraft(
        {
            connectionId: session.workspace.connectionId,
            connectionName: session.workspace.connectionName,
            host: session.workspace.host,
            port: session.workspace.port,
            defaultDatabase: session.workspace.defaultDatabase,
        },
        'session_restore',
        session.workspace.selectedTable ?? null,
        session.workspace.activeTab ?? 'browse',
    )
}
