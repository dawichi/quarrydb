import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MysqlConnectionSecretsService } from './mysql-connection-secrets.service'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke }))

describe('MysqlConnectionSecretsService', () => {
    beforeEach(() => invoke.mockReset())

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

    it('loads a remembered password into the runtime cache', async () => {
        invoke.mockResolvedValue('remembered')
        const service = new MysqlConnectionSecretsService()

        await expect(service.load('mysql-1')).resolves.toBe('remembered')
        expect(service.get('mysql-1')).toBe('remembered')
        expect(invoke).toHaveBeenCalledWith('get_mysql_password', { connectionId: 'mysql-1' })
    })

    it('remembers and forgets a password through the OS store', async () => {
        invoke.mockResolvedValue(undefined)
        const service = new MysqlConnectionSecretsService()

        await expect(service.remember('mysql-1', ' secret ')).resolves.toBe(true)
        expect(invoke).toHaveBeenCalledWith('set_mysql_password', { connectionId: 'mysql-1', password: 'secret' })

        await expect(service.forget('mysql-1')).resolves.toBe(true)
        expect(service.get('mysql-1')).toBeNull()
        expect(invoke).toHaveBeenLastCalledWith('delete_mysql_password', { connectionId: 'mysql-1' })
    })

    it('deletes a persisted password without clearing the active runtime password', async () => {
        invoke.mockResolvedValue(undefined)
        const service = new MysqlConnectionSecretsService()
        service.set('mysql-1', 'active')

        await expect(service.deletePersisted('mysql-1')).resolves.toBe(true)
        expect(service.get('mysql-1')).toBe('active')
    })
})
