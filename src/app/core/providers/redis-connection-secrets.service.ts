import { Injectable } from '@angular/core'
import { invoke } from '@tauri-apps/api/core'

@Injectable({ providedIn: 'root' })
export class RedisConnectionSecretsService {
    private readonly runtime = new Map<string, string>()

    get(connectionId: string): string {
        return this.runtime.get(connectionId) ?? ''
    }

    set(connectionId: string, password: string): void {
        this.runtime.set(connectionId, password)
    }

    async remember(connectionId: string, password: string): Promise<boolean> {
        try {
            await invoke('set_redis_password', { connectionId, password })
            this.runtime.set(connectionId, password)
            return true
        } catch {
            return false
        }
    }

    async loadRemembered(connectionId: string): Promise<string | null> {
        try {
            const password = await invoke<string | null>('get_redis_password', { connectionId })
            if (password !== null) this.runtime.set(connectionId, password)
            return password
        } catch {
            return null
        }
    }

    async deletePersisted(connectionId: string): Promise<void> {
        try {
            await invoke('delete_redis_password', { connectionId })
        } catch {
            // Secret cleanup should not block profile removal.
        }
    }

    forget(connectionId: string): void {
        this.runtime.delete(connectionId)
        void this.deletePersisted(connectionId)
    }
}
