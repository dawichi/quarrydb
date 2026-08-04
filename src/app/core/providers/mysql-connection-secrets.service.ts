import { Injectable } from '@angular/core'
import { invoke } from '@tauri-apps/api/core'

type StoredPassword = string | null

@Injectable({ providedIn: 'root' })
export class MysqlConnectionSecretsService {
    private readonly passwords = new Map<string, string>()

    get(connectionId: string): string | null {
        return this.passwords.get(connectionId) ?? null
    }

    set(connectionId: string, password: string): void {
        const normalized = password.trim()
        if (!normalized) {
            this.passwords.delete(connectionId)
            return
        }
        this.passwords.set(connectionId, normalized)
    }

    has(connectionId: string): boolean {
        return this.passwords.has(connectionId)
    }

    remove(connectionId: string): void {
        this.passwords.delete(connectionId)
    }

    async load(connectionId: string): Promise<string | null> {
        const cached = this.get(connectionId)
        if (cached) return cached

        try {
            const password = await invoke<StoredPassword>('get_mysql_password', { connectionId })
            if (password) this.set(connectionId, password)
            return password
        } catch {
            return null
        }
    }

    async remember(connectionId: string, password: string): Promise<boolean> {
        const normalized = password.trim()
        if (!normalized) return false

        this.set(connectionId, normalized)
        try {
            await invoke('set_mysql_password', { connectionId, password: normalized })
            return true
        } catch {
            return false
        }
    }

    async forget(connectionId: string): Promise<boolean> {
        this.remove(connectionId)
        return this.deletePersisted(connectionId)
    }

    async deletePersisted(connectionId: string): Promise<boolean> {
        try {
            await invoke('delete_mysql_password', { connectionId })
            return true
        } catch {
            return false
        }
    }
}
