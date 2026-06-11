import type { ProviderId } from './provider'

export interface RecentItemBase {
    id: string
    providerId: ProviderId
    label: string
    subtitle?: string
    openedAt: number
}

export interface SqliteRecentItem extends RecentItemBase {
    providerId: 'sqlite'
    resource: {
        path: string
    }
}

export interface MysqlRecentItem extends RecentItemBase {
    providerId: 'mysql'
    resource: {
        connectionId: string
        host: string
        port: number
        defaultDatabase?: string
    }
}

export type RecentItem = SqliteRecentItem | MysqlRecentItem
