import { describe, expect, it } from 'vitest'
import { MysqlProviderService } from './mysql-provider.service'

describe('MysqlProviderService', () => {
    it('exposes a planned home launcher action', () => {
        const service = new MysqlProviderService()

        expect(service.homeLaunchAction).toEqual({
            id: 'mysql-preview',
            status: 'planned',
            name: 'MySQL',
            description: 'Connect to a saved MySQL server profile once the second provider lands.',
            icon: 'mysql-server',
            openLabel: 'Connect to MySQL',
            openHint: 'Planned provider: saved connections, browse, and raw SQL.',
            badgeLabel: 'Planned',
            availabilityNote: 'MySQL support is not shipped yet.',
        })
    })

    it('builds a sensible default connection draft', () => {
        const service = new MysqlProviderService()

        expect(service.createDraft()).toEqual({
            name: '',
            host: 'localhost',
            port: 3306,
            username: '',
            sslMode: 'preferred',
        })
    })
})
