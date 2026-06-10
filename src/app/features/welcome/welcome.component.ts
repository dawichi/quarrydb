import { Component, inject } from '@angular/core'
import { RecentItemsService } from '../../core/services/recent-items.service'
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
    protected readonly recentItemsSvc = inject(RecentItemsService)

    protected get recentItems() {
        return this.recentItemsSvc.load()
    }

    protected startTutorial(): void {
        this.tutorialSvc.start()
        void this.workspaceStore.openSampleDatabase()
    }
}
