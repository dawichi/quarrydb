import { Injectable } from '@angular/core'
import type { PipelineStep } from '@quarrydb/shared'

export interface QueryHistoryEntry {
    id: string
    sql: string
    /** Snapshot of the pipeline that produced `sql` — lets the entry be reloaded into the
     *  visual builder (the flat SQL string alone can't be: it's a full CTE chain, not a
     *  fragment the builder could splice back in). Mirrors `SavedQuery.steps`. */
    steps: PipelineStep[]
    source: { path: string; alias: string; tableName: string; columns: string[] }
    executedAt: number
    durationMs: number
    rowCount: number
}

const STORAGE_KEY = 'quarry_query_history'
const ENABLED_KEY = 'quarry_query_history_enabled'

/** Bounds storage growth — oldest entries fall off once the log exceeds this. */
const MAX_ENTRIES = 200

/**
 * Opt-in log of executed queries (disabled by default — see `isEnabled`/`setEnabled`).
 * Mirrors `SavedQueriesService`'s flat localStorage array, but global rather than
 * per-table: history is meant to span tables and files within a session.
 */
@Injectable({ providedIn: 'root' })
export class QueryHistoryService {
    isEnabled(): boolean {
        return localStorage.getItem(ENABLED_KEY) === 'true'
    }

    setEnabled(enabled: boolean): void {
        localStorage.setItem(ENABLED_KEY, String(enabled))
    }

    load(): QueryHistoryEntry[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            return raw ? (JSON.parse(raw) as QueryHistoryEntry[]) : []
        } catch {
            return []
        }
    }

    /**
     * Appends an entry — a no-op when history is disabled, or when it exactly repeats
     * the most recently logged query for the same source (the caller already debounces
     * on "pipeline settled," this guards the case where settling produces unchanged SQL).
     */
    log(entry: Omit<QueryHistoryEntry, 'id' | 'executedAt'>): void {
        if (!this.isEnabled()) return
        const all = this.load()
        const last = all.at(-1)
        if (
            last?.sql === entry.sql &&
            last.source.path === entry.source.path &&
            last.source.tableName === entry.source.tableName
        ) {
            return
        }
        all.push({ ...entry, id: crypto.randomUUID(), executedAt: Date.now() })
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(-MAX_ENTRIES)))
    }

    /** Case-insensitive substring match over the SQL text and source table name. */
    search(text: string): QueryHistoryEntry[] {
        const needle = text.trim().toLowerCase()
        const all = this.load()
        if (!needle) return all
        return all.filter(
            (e) => e.sql.toLowerCase().includes(needle) || e.source.tableName.toLowerCase().includes(needle),
        )
    }

    clear(): void {
        localStorage.removeItem(STORAGE_KEY)
    }
}
