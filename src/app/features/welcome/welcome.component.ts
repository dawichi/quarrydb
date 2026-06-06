import { Component, inject } from '@angular/core'
import { RecentFilesService } from '../../core/services/recent-files.service'
import { TutorialService } from '../../core/services/tutorial.service'
import { WorkspaceStore } from '../../core/store/workspace.store'

@Component({
    selector: 'app-welcome',
    host: { class: 'flex-1 min-h-0' },
    templateUrl: './welcome.component.html',
})
export class WelcomeComponent {
    protected readonly workspaceStore = inject(WorkspaceStore)
    protected readonly tutorialSvc = inject(TutorialService)
    protected readonly recentFilesSvc = inject(RecentFilesService)

    protected get recentFiles() {
        return this.recentFilesSvc.load()
    }

    protected startTutorial(): void {
        this.tutorialSvc.start()
        void this.workspaceStore.openSampleDatabase()
    }
}
