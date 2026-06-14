import { describe, expect, it } from 'vitest'
import { MysqlConnectionSecretsService } from './mysql-connection-secrets.service'

describe('MysqlConnectionSecretsService', () => {
    it('stores passwords in runtime memory only', () => {
        const service = new MysqlConnectionSecretsService()

        service.set('mysql-1', 'secret')

        expect(service.has('mysql-1')).toBe(true)
        expect(service.get('mysql-1')).toBe('secret')
    })

    it('drops blank passwords instead of storing them', () => {
        const service = new MysqlConnectionSecretsService()

        service.set('mysql-1', '   ')

        expect(service.has('mysql-1')).toBe(false)
        expect(service.get('mysql-1')).toBeNull()
    })

    it('removes stored passwords explicitly', () => {
        const service = new MysqlConnectionSecretsService()

        service.set('mysql-1', 'secret')
        service.remove('mysql-1')

        expect(service.get('mysql-1')).toBeNull()
    })
})
