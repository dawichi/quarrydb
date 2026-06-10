import { SqliteWorkspaceStore } from './sqlite-workspace.store'

// Transitional compatibility token while the codebase finishes renaming the
// SQLite-specific store away from the old app-global name.
export abstract class WorkspaceStore extends SqliteWorkspaceStore {}
