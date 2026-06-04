import { Injectable, computed, inject, signal } from '@angular/core'
import type { DatabaseSchema, Workspace } from '@quarrydb/shared'
import { DatabaseService } from '../services/database.service'

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
    // ─── Injected Services ────────────────────────────────────────────────────
    private readonly db = inject(DatabaseService)

    // ─── State ────────────────────────────────────────────────────────────────
    readonly workspace = signal<Workspace | null>(null)
    readonly schemas = signal<DatabaseSchema[]>([])
    readonly isLoading = signal(false)
    readonly error = signal<string | null>(null)

    // ─── Computed ─────────────────────────────────────────────────────────────
    readonly hasWorkspace = computed(() => this.workspace() !== null)

    // ─── Public Methods ───────────────────────────────────────────────────────
    async openDatabase(): Promise<void> {
        this.isLoading.set(true)
        this.error.set(null)

        try {
            const path = await this.db.pickFile()
            if (!path) return

            const alias = 'main'
            const schema = await this.db.loadSchema(path, alias)
            const fileName = path.split('/').pop() ?? path

            this.workspace.set({
                id: crypto.randomUUID(),
                name: fileName,
                databases: [{ path, alias }],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            })
            this.schemas.set([schema])
        } catch (err) {
            this.error.set(err instanceof Error ? err.message : 'Failed to open database')
        } finally {
            this.isLoading.set(false)
        }
    }
}
