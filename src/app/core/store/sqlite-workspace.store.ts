import { WorkspaceStore } from './workspace.store'

// Transitional alias: keeps one implementation instance while SQLite-specific
// consumers stop depending on the app-global store name.
export abstract class SqliteWorkspaceStore extends WorkspaceStore {}
