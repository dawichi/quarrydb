import { Injectable, signal } from '@angular/core'
import type { ProviderId } from '@quarrydb/shared/provider'

@Injectable({ providedIn: 'root' })
export class WorkspaceHostStore {
    readonly activeProviderId = signal<ProviderId | null>(null)
    readonly hasWorkspace = signal(false)
    readonly isLoading = signal(false)
    readonly error = signal<string | null>(null)

    setActiveProvider(providerId: ProviderId | null): void {
        this.activeProviderId.set(providerId)
    }

    setWorkspaceOpen(providerId: ProviderId): void {
        this.activeProviderId.set(providerId)
        this.hasWorkspace.set(true)
    }

    clearWorkspace(): void {
        this.activeProviderId.set(null)
        this.hasWorkspace.set(false)
    }
}
