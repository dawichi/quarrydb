import { Component, inject } from '@angular/core'
import { LucideBookOpen, LucideFolderOpen } from '@lucide/angular'
import type { ProviderId } from '@quarrydb/shared/provider'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { ProviderLaunchAction } from '../../core/providers/provider-definition'
import { ProviderRegistryService } from '../../core/providers/provider-registry.service'
import { RecentItemsService } from '../../core/services/recent-items.service'
import { TutorialService } from '../../core/services/tutorial.service'
import { WorkspaceHostStore } from '../../core/store/workspace-host.store'

@Component({
    selector: 'app-welcome',
    host: { class: 'flex-1 min-h-0' },
    imports: [LucideBookOpen, LucideFolderOpen],
    templateUrl: './welcome.component.html',
})
export class WelcomeComponent {
    protected readonly workspaceHost = inject(WorkspaceHostStore)
    protected readonly tutorialSvc = inject(TutorialService)
    protected readonly recentItemsSvc = inject(RecentItemsService)
    private readonly providers = inject(ProviderRegistryService)
    protected readonly launchActions = this.providers.getLaunchActions()

    protected get recentItems() {
        return this.recentItemsSvc.load()
    }

    protected openProvider(providerId: ProviderId): void {
        void this.providers.openFromHome(providerId)
    }

    protected openSample(providerId: ProviderId): void {
        void this.providers.openSample(providerId)
    }

    protected reopenRecentItem(item: RecentItem): void {
        void this.providers.openRecentItem(item)
    }

    protected providerAction(providerId: ProviderId): ProviderLaunchAction {
        return this.launchActions.find((action) => action.id === providerId) ?? this.launchActions[0]
    }

    protected startTutorial(): void {
        this.tutorialSvc.start()
        void this.providers.openSample(this.providers.defaultProviderId)
    }
}
