import { Component, inject, signal } from '@angular/core'
import { parseRedisCommand } from '../../core/providers/redis-command-parser'
import type { RedisConnectionProfileDraft } from '../../core/providers/redis-connection-profile'
import { RedisProviderService } from '../../core/providers/redis-provider.service'
import { RedisWorkspaceStore } from '../../core/store/redis-workspace.store'
import { WorkspaceHostStore } from '../../core/store/workspace-host.store'

@Component({
    selector: 'app-redis-workspace',
    host: { class: 'flex min-h-0 flex-1 flex-col' },
    templateUrl: './redis-workspace.component.html',
})
export class RedisWorkspaceComponent {
    protected readonly provider = inject(RedisProviderService)
    protected readonly store = inject(RedisWorkspaceStore)
    protected readonly host = inject(WorkspaceHostStore)
    protected readonly draft = signal<RedisConnectionProfileDraft>(this.provider.createDraft())
    protected readonly command = signal('PING')
    protected readonly valueDraft = signal('')
    protected readonly ttlDraft = signal('')
    protected readonly activeTab = signal<'keys' | 'command'>('keys')

    protected profiles() {
        return this.provider.loadProfiles()
    }

    protected updateDraft<K extends keyof RedisConnectionProfileDraft>(
        field: K,
        value: RedisConnectionProfileDraft[K],
    ): void {
        this.draft.update((draft) => ({ ...draft, [field]: value }))
    }

    protected async connect(): Promise<void> {
        await this.provider.connectDraft(this.draft())
    }

    protected save(): void {
        this.provider.saveDraft(this.draft())
    }

    protected saveAndConnect(): void {
        const profile = this.provider.saveDraft(this.draft())
        this.provider.selectProfile(profile.id)
        void this.provider.connectWorkspaceDraft()
    }

    protected useProfile(id: string): void {
        this.provider.selectProfile(id)
    }

    protected removeProfile(id: string): void {
        this.provider.removeProfile(id)
    }

    protected selectKey(key: string): void {
        void this.store.selectKey(key).then(() => {
            const details = this.store.keyDetails()
            this.valueDraft.set(typeof details?.value === 'string' ? details.value : '')
            this.ttlDraft.set(details && details.ttlMs > 0 ? String(details.ttlMs) : '')
        })
    }

    protected saveString(): void {
        const details = this.store.keyDetails()
        if (details?.kind !== 'string') return
        const ttl = this.ttlDraft().trim()
        const ttlMs = ttl ? Number(ttl) : null
        if (ttlMs !== null && (!Number.isInteger(ttlMs) || ttlMs <= 0)) return
        void this.store.setString(details.key, this.valueDraft(), ttlMs)
    }

    protected runCommand(): void {
        const parsed = parseRedisCommand(this.command())
        if (parsed.error) {
            this.store.error.set(parsed.error)
            return
        }
        void this.store.runCommand(parsed.args)
    }

    protected formatOutput(value: unknown): string {
        return value === undefined ? '' : JSON.stringify(value, null, 2)
    }

    protected formatDetails(value: unknown): string {
        return typeof value === 'string' ? value : this.formatOutput(value)
    }

    protected setTab(tab: 'keys' | 'command'): void {
        this.activeTab.set(tab)
    }

    protected backHome(): void {
        this.provider.clearWorkspace()
        this.host.clearWorkspace()
    }
}
