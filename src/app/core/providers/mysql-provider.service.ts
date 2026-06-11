import { Injectable } from '@angular/core'
import type { MysqlConnectionProfileDraft } from './mysql-connection-profile'
import type { HomeLaunchAction } from './provider-definition'

@Injectable({ providedIn: 'root' })
export class MysqlProviderService {
    readonly homeLaunchAction: HomeLaunchAction = {
        id: 'mysql-preview',
        status: 'planned',
        name: 'MySQL',
        description: 'Connect to a saved MySQL server profile once the second provider lands.',
        icon: 'mysql-server',
        openLabel: 'Connect to MySQL',
        openHint: 'Planned provider: saved connections, browse, and raw SQL.',
        badgeLabel: 'Planned',
        availabilityNote: 'MySQL support is not shipped yet.',
    }

    createDraft(): MysqlConnectionProfileDraft {
        return {
            name: '',
            host: 'localhost',
            port: 3306,
            username: '',
            sslMode: 'preferred',
        }
    }
}
