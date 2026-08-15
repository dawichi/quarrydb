import { Injectable, inject } from '@angular/core'
import type { PersistedSession } from '@quarrydb/shared/session'
import { MysqlProviderService } from '../providers/mysql-provider.service'
import { ProviderRegistryService } from '../providers/provider-registry.service'
import { RedisProviderService } from '../providers/redis-provider.service'
import { PipelineStore } from '../store/pipeline.store'
import { SqliteWorkspaceStore } from '../store/sqlite-workspace.store'
import { WorkspaceHostStore } from '../store/workspace-host.store'
import { isLegacyPersistedSession, isPersistedSession } from './session-validation'

const SESSION_KEY = 'quarry_session'

@Injectable({ providedIn: 'root' })
export class SessionService {
    private readonly providers = inject(ProviderRegistryService)
    private readonly workspaceHost = inject(WorkspaceHostStore)
    private readonly workspaceStore = inject(SqliteWorkspaceStore)
    private readonly mysqlProvider = inject(MysqlProviderService)
    private readonly redisProvider = inject(RedisProviderService)
    private readonly pipelineStore = inject(PipelineStore)
    private saveTimer: ReturnType<typeof setTimeout> | null = null

    // Called inside a reactive effect — reads signals so the effect tracks them.
    buildSession(): PersistedSession | null {
        if (this.workspaceHost.activeProviderId() === 'mysql') {
            return this.mysqlProvider.buildActiveSession(Date.now())
        }
        if (this.workspaceHost.activeProviderId() === 'redis') {
            return this.redisProvider.buildActiveSession(Date.now())
        }

        const schemas = this.workspaceStore.schemas()
        if (!schemas.length) return null
        const src = this.pipelineStore.source()
        return {
            version: 1,
            providerId: 'sqlite',
            savedAt: Date.now(),
            workspace: {
                name: this.workspaceStore.workspace()?.name ?? schemas[0].path.split('/').pop() ?? schemas[0].path,
                databases: schemas.map((s) => ({ path: s.path, alias: s.alias })),
                activeTab: this.workspaceStore.activeTab(),
                selectedTable: this.workspaceStore.selectedTable(),
            },
            pipeline: {
                source: src
                    ? { path: src.path, alias: src.alias, tableName: src.tableName, columns: src.columns }
                    : null,
                steps: this.pipelineStore.steps(),
                variableValues: this.pipelineStore.variableValues(),
            },
        }
    }

    debouncedSave(session: PersistedSession): void {
        if (this.saveTimer) clearTimeout(this.saveTimer)
        this.saveTimer = setTimeout(() => {
            try {
                localStorage.setItem(SESSION_KEY, JSON.stringify(session))
            } catch {
                // localStorage quota error — ignore
            }
        }, 500)
    }

    clear(): void {
        if (this.saveTimer) clearTimeout(this.saveTimer)
        localStorage.removeItem(SESSION_KEY)
    }

    async restore(): Promise<void> {
        let session: PersistedSession | null = null
        try {
            const raw = localStorage.getItem(SESSION_KEY)
            if (!raw) return
            const parsed = JSON.parse(raw) as unknown
            session = this.normalizePersistedSession(parsed)
        } catch {
            return
        }

        if (!session) return
        if (!this.providers.canRestoreSession(session.providerId)) {
            this.clear()
            return
        }

        try {
            await this.providers.restoreSession(session)
        } catch {
            // Provider-local restore failed — discard the session.
            this.clear()
        }
    }

    private normalizePersistedSession(parsed: unknown): PersistedSession | null {
        if (isPersistedSession(parsed)) {
            return parsed
        }
        if (isLegacyPersistedSession(parsed)) {
            return {
                version: 1,
                providerId: 'sqlite',
                savedAt: Date.now(),
                workspace: {
                    name: parsed.databases[0].path.split('/').pop() ?? parsed.databases[0].path,
                    databases: parsed.databases,
                    activeTab: parsed.activeTab,
                    selectedTable: parsed.selectedTable,
                },
                pipeline: parsed.pipeline,
            }
        }
        return null
    }
}
