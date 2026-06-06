import { Component, inject } from '@angular/core'
import { TutorialService } from '../../core/services/tutorial.service'

interface StepConfig {
    title: string
    description: string
    hint: string
}

@Component({
    selector: 'app-tutorial-overlay',
    templateUrl: './tutorial-overlay.component.html',
})
export class TutorialOverlayComponent {
    protected readonly tutorialSvc = inject(TutorialService)

    protected readonly TOTAL_STEPS = 4

    protected readonly steps: Record<number, StepConfig> = {
        1: {
            title: 'Load the sample database',
            description:
                'A save dialog will open. Choose where to save the sample e-commerce database (customers, orders, products).',
            hint: 'Waiting for database to open…',
        },
        2: {
            title: 'Click a table in the sidebar',
            description: 'The sample database has 4 tables. Click any one — try orders — to browse its rows.',
            hint: 'Waiting for table selection…',
        },
        3: {
            title: 'Build a query',
            description:
                'Click the Query tab above, press "+ Add step", and choose WHERE. Try typing: status = \'delivered\'',
            hint: 'Waiting for your first step…',
        },
        4: {
            title: "You're all set!",
            description: 'Copy the SQL or export your results using the buttons in the SQL panel. Welcome to Quarry!',
            hint: '',
        },
    }

    protected get current(): StepConfig | null {
        return this.steps[this.tutorialSvc.step()] ?? null
    }

    protected stepRange(): number[] {
        return Array.from({ length: this.TOTAL_STEPS }, (_, i) => i + 1)
    }
}
