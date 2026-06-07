import { Component, inject } from '@angular/core'
import { UpdaterService } from '../../core/services/updater.service'

@Component({
    selector: 'app-update-check-modal',
    templateUrl: './update-check-modal.component.html',
})
export class UpdateCheckModalComponent {
    protected readonly updaterSvc = inject(UpdaterService)

    protected close(): void {
        this.updaterSvc.dismissManualCheck()
    }
}
