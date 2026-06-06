import { Injectable } from '@angular/core'
import type { PipelineStep } from '@quarrydb/shared'

export interface SavedQuery {
    id: string
    name: string
    source: { path: string; alias: string; tableName: string; columns: string[] }
    steps: PipelineStep[]
    createdAt: number
    updatedAt: number
}

const STORAGE_KEY = 'quarry_saved_queries'

@Injectable({ providedIn: 'root' })
export class SavedQueriesService {
    load(): SavedQuery[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            return raw ? (JSON.parse(raw) as SavedQuery[]) : []
        } catch {
            return []
        }
    }

    forTable(tableName: string): SavedQuery[] {
        return this.load().filter((q) => q.source.tableName === tableName)
    }

    save(query: SavedQuery): void {
        const all = this.load()
        const idx = all.findIndex((q) => q.id === query.id)
        if (idx >= 0) all[idx] = query
        else all.push(query)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    }

    delete(id: string): void {
        const all = this.load().filter((q) => q.id !== id)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    }
}
