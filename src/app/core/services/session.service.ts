import { Injectable, inject } from '@angular/core'
import type { PipelineStep } from '@quarrydb/shared'
import type { MysqlPersistedSession, PersistedSession, SqlitePersistedSession } from '@quarrydb/shared/session'
import { ProviderRegistryService } from '../providers/provider-registry.service'
import { PipelineStore } from '../store/pipeline.store'
import { SqliteWorkspaceStore } from '../store/sqlite-workspace.store'

interface LegacyPersistedSession {
    version: 1
    databases: Array<{ path: string; alias: string }>
    activeTab: 'browse' | 'query' | 'edit'
    selectedTable: { schemaAlias: string; tableName: string } | null
    pipeline: {
        source: { path: string; alias: string; tableName: string; columns: string[] } | null
        steps: PipelineStep[]
        variableValues: Record<string, string>
    }
}

const SESSION_KEY = 'quarry_session'

@Injectable({ providedIn: 'root' })
export class SessionService {
    private readonly providers = inject(ProviderRegistryService)
    private readonly workspaceStore = inject(SqliteWorkspaceStore)
    private readonly pipelineStore = inject(PipelineStore)
    private saveTimer: ReturnType<typeof setTimeout> | null = null

    // Called inside a reactive effect — reads signals so the effect tracks them.
    buildSession(): PersistedSession | null {
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
        if (this.isSqlitePersistedSession(parsed)) {
            return parsed
        }
        if (this.isMysqlPersistedSession(parsed)) {
            return parsed
        }
        if (this.isLegacyPersistedSession(parsed)) {
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

    private isSqlitePersistedSession(parsed: unknown): parsed is SqlitePersistedSession {
        if (!parsed || typeof parsed !== 'object') return false
        const candidate = parsed as Partial<SqlitePersistedSession>
        return (
            candidate.version === 1 &&
            candidate.providerId === 'sqlite' &&
            !!candidate.workspace &&
            Array.isArray(candidate.workspace.databases) &&
            candidate.workspace.databases.length > 0 &&
            !!candidate.pipeline
        )
    }

    private isMysqlPersistedSession(parsed: unknown): parsed is MysqlPersistedSession {
        if (!parsed || typeof parsed !== 'object') return false
        const candidate = parsed as Partial<MysqlPersistedSession>
        return (
            candidate.version === 1 &&
            candidate.providerId === 'mysql' &&
            !!candidate.workspace &&
            typeof candidate.workspace.connectionId === 'string' &&
            typeof candidate.workspace.connectionName === 'string' &&
            typeof candidate.workspace.host === 'string' &&
            typeof candidate.workspace.port === 'number' &&
            !!candidate.pipeline
        )
    }

    private isLegacyPersistedSession(parsed: unknown): parsed is LegacyPersistedSession {
        if (!parsed || typeof parsed !== 'object') return false
        const candidate = parsed as Partial<LegacyPersistedSession>
        return candidate.version === 1 && Array.isArray(candidate.databases) && candidate.databases.length > 0
    }
}
