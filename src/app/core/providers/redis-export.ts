import type { RedisKeyDetails } from './redis-backend-adapter'

export function serializeRedisKeyspace(details: RedisKeyDetails[]): string {
    return JSON.stringify(details, null, 2)
}
