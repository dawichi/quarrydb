import { Injectable, inject } from '@angular/core'
import type { DatabaseSchema, PipelineStep } from '@quarrydb/shared'
import { PipelineStore } from '../store/pipeline.store'
import { WorkspaceStore } from '../store/workspace.store'
import { DatabaseService } from './database.service'

interface PersistedSession {
    version: 1
    databases: { path: string; alias: string }[]
    activeTab: 'browse' | 'query' | 'edit'
    selectedTable: { schemaAlias: string; tableName: string } | null
    pipeline: {
        source: { path: string; alias: string; tableName: string; columns: string[] } | null
        steps: PipelineStep[]
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
            databases: schemas.map((s) => ({ path: s.path, alias: s.alias })),
            activeTab: this.workspaceStore.activeTab(),
            selectedTable: this.workspaceStore.selectedTable(),
            pipeline: {
                source: src
                    ? { path: src.path, alias: src.alias, tableName: src.tableName, columns: src.columns }
                    : null,
                steps: this.pipelineStore.steps(),
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
            const parsed = JSON.parse(raw)
            if (parsed?.version !== 1 || !Array.isArray(parsed.databases) || !parsed.databases.length) return
            session = parsed as PersistedSession
        } catch {
            return
        }

        // Re-load schemas from disk — verifies the files still exist at the saved paths.
        let schemas: DatabaseSchema[]
        try {
            schemas = await Promise.all(session.databases.map((d) => this.db.loadSchema(d.path, d.alias)))
        } catch {
            // File moved or deleted — discard the session.
            this.clear()
            return
        }

        const name = session.databases[0].path.split('/').pop() ?? session.databases[0].path
        this.workspaceStore.restoreWorkspace(schemas, name)

        if (session.activeTab) {
            this.workspaceStore.setActiveTab(session.activeTab)
        }

        if (session.selectedTable) {
            const { schemaAlias, tableName } = session.selectedTable
            await this.workspaceStore.selectTable(schemaAlias, tableName)
        }

        if (session.pipeline?.source) {
            const src = session.pipeline.source
            await this.pipelineStore.openForTable(src.path, src.alias, src.tableName, src.columns)
            if (session.pipeline.steps?.length) {
                this.pipelineStore.restoreSteps(session.pipeline.steps)
            }
        }
    }
}
