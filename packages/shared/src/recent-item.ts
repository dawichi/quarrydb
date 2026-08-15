import type { MysqlConnectionTarget } from './mysql-connection-target'
import type { ProviderId } from './provider'
import type { RedisConnectionTarget } from './redis-connection-target'

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
    resource: MysqlConnectionTarget
}

export interface RedisRecentItem extends RecentItemBase {
    providerId: 'redis'
    resource: RedisConnectionTarget
}

export type RecentItem = SqliteRecentItem | MysqlRecentItem | RedisRecentItem
