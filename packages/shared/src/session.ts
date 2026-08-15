import type { PipelineStep } from './index'
import type { MysqlConnectionTarget } from './mysql-connection-target'
import type { ProviderId } from './provider'
import type { RedisConnectionTarget } from './redis-connection-target'

export type WorkspaceTab = 'browse' | 'query' | 'edit'
export type MysqlWorkspaceTab = WorkspaceTab | 'pipeline'

export interface PersistedSessionBase {
    version: 1
    providerId: ProviderId
    savedAt: number
}

export interface SqliteWorkspaceSelection {
    schemaAlias: string
    tableName: string
}

export interface SqliteWorkspaceDatabase {
    path: string
    alias: string
}

export interface SqliteWorkspaceSessionState {
    name: string
    databases: SqliteWorkspaceDatabase[]
    selectedTable?: SqliteWorkspaceSelection | null
    activeTab?: WorkspaceTab
}

export interface SqlitePipelineSessionSource {
    path: string
    alias: string
    tableName: string
    columns: string[]
}

export interface SqlitePipelineSessionState {
    source: SqlitePipelineSessionSource | null
    steps: PipelineStep[]
    variableValues: Record<string, string>
}

export interface SqlitePersistedSession extends PersistedSessionBase {
    providerId: 'sqlite'
    workspace: SqliteWorkspaceSessionState
    pipeline: SqlitePipelineSessionState
}

export interface MysqlWorkspaceSelection {
    schemaName: string
    tableName: string
}

export interface MysqlWorkspaceSessionState extends MysqlConnectionTarget {
    selectedTable?: MysqlWorkspaceSelection | null
    activeTab?: MysqlWorkspaceTab
}

export interface MysqlPipelineSessionSource {
    connectionId: string
    schemaName: string
    tableName: string
    columns: string[]
}

export interface MysqlPipelineSessionState {
    source: MysqlPipelineSessionSource | null
    steps: PipelineStep[]
    variableValues: Record<string, string>
}

export interface MysqlPersistedSession extends PersistedSessionBase {
    providerId: 'mysql'
    workspace: MysqlWorkspaceSessionState
    pipeline: MysqlPipelineSessionState
}

export type RedisWorkspaceTab = 'keys' | 'command'

export interface RedisWorkspaceSessionState extends RedisConnectionTarget {
    selectedKey?: string | null
    keyPattern?: string
    activeTab?: RedisWorkspaceTab
}

export interface RedisPersistedSession extends PersistedSessionBase {
    providerId: 'redis'
    workspace: RedisWorkspaceSessionState
}

export type PersistedSession = SqlitePersistedSession | MysqlPersistedSession | RedisPersistedSession
