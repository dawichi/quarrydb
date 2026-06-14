import { Injectable } from '@angular/core'

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
}
