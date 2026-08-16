import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { UpdaterService } from '../../core/services/updater.service'

@Component({
    selector: 'app-update-check-modal',
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './update-check-modal.component.html',
})
export class UpdateCheckModalComponent {
    protected readonly updaterSvc = inject(UpdaterService)

    protected close(): void {
        // Don't let a stray backdrop click hide the install narration mid-flight —
        // the update keeps running regardless, so dismissing here would just leave
        // the user without the feedback this modal exists to provide.
        const status = this.updaterSvc.modalStatus()
        if (status === 'downloading' || status === 'downloaded' || status === 'restarting') return

        this.updaterSvc.dismissModal()
    }
}
