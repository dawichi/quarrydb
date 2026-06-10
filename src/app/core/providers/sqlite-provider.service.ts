import { Injectable, inject } from '@angular/core'
import type { DatabaseSchema } from '@quarrydb/shared'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { SqlitePersistedSession } from '@quarrydb/shared/session'
import { DatabaseService } from '../services/database.service'
import { PipelineStore } from '../store/pipeline.store'
import { WorkspaceStore } from '../store/workspace.store'
import type { ProviderDefinition } from './provider-definition'

@Injectable({ providedIn: 'root' })
export class SqliteProviderService implements ProviderDefinition<SqlitePersistedSession> {
    readonly id = 'sqlite' as const

    private readonly workspaceStore = inject(WorkspaceStore)
    private readonly pipelineStore = inject(PipelineStore)
    private readonly db = inject(DatabaseService)

    async openFromHome(): Promise<void> {
        await this.workspaceStore.openDatabase()
    }

    async openSample(): Promise<void> {
        await this.workspaceStore.openSampleDatabase()
    }

    async openRecentItem(item: RecentItem): Promise<void> {
        if (item.providerId !== 'sqlite') {
            throw new Error(`SQLite provider cannot open recent item for provider ${item.providerId}`)
        }
        await this.workspaceStore.openRecentItem(item)
    }

    async restoreSession(session: SqlitePersistedSession): Promise<void> {
        let schemas: DatabaseSchema[]
        try {
            schemas = await Promise.all(session.workspace.databases.map((d) => this.db.loadSchema(d.path, d.alias)))
        } catch {
            throw new Error('Failed to restore SQLite session')
        }

        this.workspaceStore.restoreWorkspace(schemas, session.workspace.name)

        if (session.workspace.activeTab) {
            this.workspaceStore.setActiveTab(session.workspace.activeTab)
        }

        if (session.workspace.selectedTable) {
            const { schemaAlias, tableName } = session.workspace.selectedTable
            await this.workspaceStore.selectTable(schemaAlias, tableName)
        }

        if (session.pipeline.source) {
            const src = session.pipeline.source
            await this.pipelineStore.openForTable(src.path, src.alias, src.tableName, src.columns)
            if (session.pipeline.steps.length > 0) {
                this.pipelineStore.restoreSteps(session.pipeline.steps)
            }
            this.pipelineStore.variableValues.set(session.pipeline.variableValues)
        }
    }
}
