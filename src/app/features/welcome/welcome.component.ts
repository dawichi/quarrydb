import { Component, inject } from '@angular/core'
import { LucideBookOpen, LucideDatabase, LucideFolderOpen } from '@lucide/angular'
import type { ProviderId } from '@quarrydb/shared/provider'
import type { RecentItem } from '@quarrydb/shared/recent-item'
import type { HomeLaunchAction, ProviderLaunchAction } from '../../core/providers/provider-definition'
import { ProviderRegistryService } from '../../core/providers/provider-registry.service'
import { RecentItemsService } from '../../core/services/recent-items.service'
import { TutorialService } from '../../core/services/tutorial.service'
import { WorkspaceHostStore } from '../../core/store/workspace-host.store'

@Component({
    selector: 'app-welcome',
    host: { class: 'flex-1 min-h-0' },
    imports: [LucideBookOpen, LucideDatabase, LucideFolderOpen],
    templateUrl: './welcome.component.html',
})
export class WelcomeComponent {
    protected readonly workspaceHost = inject(WorkspaceHostStore)
    protected readonly tutorialSvc = inject(TutorialService)
    protected readonly recentItemsSvc = inject(RecentItemsService)
    private readonly providers = inject(ProviderRegistryService)
    protected readonly launchActions = this.providers.getHomeLaunchActions()

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
        return (
            this.providers.getLaunchActions().find((action) => action.id === providerId) ??
            this.providers.getLaunchActions()[0]
        )
    }

    protected isAvailableAction(
        action: HomeLaunchAction,
    ): action is HomeLaunchAction & { status: 'available'; id: ProviderId } {
        return action.status === 'available'
    }

    protected startTutorial(): void {
        this.tutorialSvc.start()
        void this.providers.openSample(this.providers.defaultProviderId)
    }
}
