import { Injectable } from '@angular/core'

export interface RecentFile {
    path: string
    name: string
    openedAt: number
}

const STORAGE_KEY = 'quarry_recent_files'
const MAX_ENTRIES = 8

@Injectable({ providedIn: 'root' })
export class RecentFilesService {
    load(): RecentFile[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            return raw ? (JSON.parse(raw) as RecentFile[]) : []
        } catch {
            return []
        }
    }

    add(path: string): void {
        const name = path.split('/').pop() ?? path
        const all = this.load().filter((f) => f.path !== path)
        all.unshift({ path, name, openedAt: Date.now() })
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_ENTRIES)))
    }

    remove(path: string): void {
        const all = this.load().filter((f) => f.path !== path)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    }
}
