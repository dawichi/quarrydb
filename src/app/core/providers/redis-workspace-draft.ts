import type { RedisConnectionTarget } from '@quarrydb/shared/redis-connection-target'

export type RedisWorkspaceDraftSource = 'saved_profile' | 'recent_item' | 'session_restore' | 'manual'

export interface RedisWorkspaceDraft {
    target: RedisConnectionTarget
    source: RedisWorkspaceDraftSource
    selectedKey: string | null
    keyPattern: string
    activeTab: 'keys' | 'command'
}

export function createRedisWorkspaceDraft(
    target: RedisConnectionTarget,
    source: RedisWorkspaceDraftSource,
): RedisWorkspaceDraft {
    return { target, source, selectedKey: null, keyPattern: '*', activeTab: 'keys' }
}
