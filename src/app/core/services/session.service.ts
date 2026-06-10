import { Injectable, inject } from '@angular/core'
import type { DatabaseSchema, PipelineStep } from '@quarrydb/shared'
import type { PersistedSession, SqlitePersistedSession } from '@quarrydb/shared/session'
import { PipelineStore } from '../store/pipeline.store'
import { WorkspaceStore } from '../store/workspace.store'
import { DatabaseService } from './database.service'

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
    private readonly workspaceStore = inject(WorkspaceStore)
    private readonly pipelineStore = inject(PipelineStore)
    private readonly db = inject(DatabaseService)
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
        let session: PersistedSession
        try {
            const raw = localStorage.getItem(SESSION_KEY)
            if (!raw) return
            const parsed = JSON.parse(raw) as unknown
            session = this.normalizePersistedSession(parsed)
            if (!session) return
        } catch {
            return
        }

        switch (session.providerId) {
            case 'sqlite':
                await this.restoreSqliteSession(session)
                break
        }
    }

    private async restoreSqliteSession(session: SqlitePersistedSession): Promise<void> {
        // Re-load schemas from disk — verifies the files still exist at the saved paths.
        let schemas: DatabaseSchema[]
        try {
            schemas = await Promise.all(session.workspace.databases.map((d) => this.db.loadSchema(d.path, d.alias)))
        } catch {
            // File moved or deleted — discard the SQLite session.
            this.clear()
            return
        }

        this.workspaceStore.restoreWorkspace(schemas, session.workspace.name)

        if (session.workspace.activeTab) {
            this.workspaceStore.setActiveTab(session.workspace.activeTab)
        }

        if (session.workspace.selectedTable) {
            const { schemaAlias, tableName } = session.workspace.selectedTable
            await this.workspaceStore.selectTable(schemaAlias, tableName)
        }

        if (session.pipeline?.source) {
            const src = session.pipeline.source
            await this.pipelineStore.openForTable(src.path, src.alias, src.tableName, src.columns)
            if (session.pipeline.steps?.length) {
                this.pipelineStore.restoreSteps(session.pipeline.steps)
            }
            if (session.pipeline.variableValues) {
                this.pipelineStore.variableValues.set(session.pipeline.variableValues)
            }
        }
    }

    private normalizePersistedSession(parsed: unknown): PersistedSession | null {
        if (this.isSqlitePersistedSession(parsed)) {
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

    private isLegacyPersistedSession(parsed: unknown): parsed is LegacyPersistedSession {
        if (!parsed || typeof parsed !== 'object') return false
        const candidate = parsed as Partial<LegacyPersistedSession>
        return candidate.version === 1 && Array.isArray(candidate.databases) && candidate.databases.length > 0
    }
}
