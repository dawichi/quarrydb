import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { UpdaterService } from '../../core/services/updater.service'

@Component({
    selector: 'app-update-banner',
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './update-banner.component.html',
})
export class UpdateBannerComponent {
    protected readonly updaterSvc = inject(UpdaterService)
}
