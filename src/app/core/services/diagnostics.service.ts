import { Injectable, inject } from '@angular/core'
import type { ProviderId } from '@quarrydb/shared/provider'
import { getVersion } from '@tauri-apps/api/app'
import { MysqlWorkspaceStore } from '../store/mysql-workspace.store'
import { RedisWorkspaceStore } from '../store/redis-workspace.store'
import { SqliteWorkspaceStore } from '../store/sqlite-workspace.store'
import { WorkspaceHostStore } from '../store/workspace-host.store'
import { ExportService } from './export.service'
import { describeSafeError } from './safe-error'

export interface DiagnosticsReport {
    formatVersion: 1
    generatedAt: string
    app: {
        name: 'Quarry'
        version: string
    }
    runtime: {
        platform: string
        userAgent: string
    }
    workspace: {
        activeProviderId: ProviderId | null
        open: boolean
        hasError: boolean
    }
    providers: {
        sqlite: { open: boolean; schemaCount: number; tableOpen: boolean; activeTab: string }
        mysql: { connected: boolean; schemaCount: number; tableOpen: boolean; activeTab: string }
        redis: { connected: boolean; loadedKeyCount: number; activeTab: string }
    }
    privacy: string
}

export interface DiagnosticsReportInput {
    activeProviderId: ProviderId | null
    open: boolean
    hasError: boolean
    sqlite: DiagnosticsReport['providers']['sqlite']
    mysql: DiagnosticsReport['providers']['mysql']
    redis: DiagnosticsReport['providers']['redis']
}

export function buildDiagnosticsReport(
    input: DiagnosticsReportInput,
    version: string,
    platform: string,
    userAgent: string,
    generatedAt = new Date(),
): DiagnosticsReport {
    return {
        formatVersion: 1,
        generatedAt: generatedAt.toISOString(),
        app: { name: 'Quarry', version },
        runtime: { platform, userAgent },
        workspace: {
            activeProviderId: input.activeProviderId,
            open: input.open,
            hasError: input.hasError,
        },
        providers: {
            sqlite: input.sqlite,
            mysql: input.mysql,
            redis: input.redis,
        },
        privacy:
            'This report excludes passwords, keyring data, file paths, hosts, SQL text, schema/table/key names, and database values.',
    }
}

@Injectable({ providedIn: 'root' })
export class DiagnosticsService {
    private readonly exportService = inject(ExportService)
    private readonly host = inject(WorkspaceHostStore)
    private readonly sqlite = inject(SqliteWorkspaceStore)
    private readonly mysql = inject(MysqlWorkspaceStore)
    private readonly redis = inject(RedisWorkspaceStore)

    async exportReport(): Promise<void> {
        try {
            const version = await getVersion().catch(() => 'unknown')
            const report = buildDiagnosticsReport(
                {
                    activeProviderId: this.host.activeProviderId(),
                    open: this.host.hasWorkspace(),
                    hasError: this.host.error() !== null || this.redis.error() !== null,
                    sqlite: {
                        open: this.sqlite.hasWorkspace(),
                        schemaCount: this.sqlite.schemas().length,
                        tableOpen: this.sqlite.selectedTable() !== null,
                        activeTab: this.sqlite.activeTab(),
                    },
                    mysql: {
                        connected: this.mysql.connectionSession() !== null,
                        schemaCount: this.mysql.schemas().length,
                        tableOpen: this.mysql.selectedTable() !== null,
                        activeTab: this.mysql.activeTab(),
                    },
                    redis: {
                        connected: this.redis.connectionSession() !== null,
                        loadedKeyCount: this.redis.keys().length,
                        activeTab: 'keys',
                    },
                },
                version,
                typeof navigator === 'undefined' ? 'unknown' : navigator.platform,
                typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
            )
            await this.exportService.saveFile(JSON.stringify(report, null, 2), 'quarry-diagnostics.json', 'json')
        } catch (error) {
            this.host.error.set(describeSafeError(error, 'Diagnostics export failed'))
        }
    }
}
