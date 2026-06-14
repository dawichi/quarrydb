import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MysqlBackendAdapterService } from './mysql-backend-adapter.service'

    const { close, select, load } = vi.hoisted(() => {
        const close = vi.fn()
        const select = vi.fn()
        const load = vi.fn(async () => ({ close, select }))
    return { close, select, load }
})

vi.mock('@tauri-apps/plugin-sql', () => ({
    default: {
        load,
    },
}))

describe('MysqlBackendAdapterService', () => {
    let service: MysqlBackendAdapterService

    beforeEach(() => {
        service = new MysqlBackendAdapterService()
        load.mockReset()
        close.mockReset()
        select.mockReset()
        load.mockResolvedValue({ close, select })
    })

    it('opens a real mysql plugin-sql dsn and returns a provisional connection session', async () => {
        const session = await service.connect({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: '127.0.0.1',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
            username: 'quarry',
            password: 'secret word',
            sslMode: 'required',
            source: 'saved_profile',
        })

        expect(load).toHaveBeenCalledWith('mysql://quarry:secret%20word@127.0.0.1:3306/warehouse')
        expect(close).toHaveBeenCalledOnce()
        expect(session.target.connectionName).toBe('Analytics')
        expect(session.source).toBe('saved_profile')
    })

    it('lists schema names from information_schema using the saved in-memory connect request', async () => {
        select.mockResolvedValue([{ Database: 'information_schema' }, { Database: 'warehouse' }])

        const session = await service.connect({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: '127.0.0.1',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
            username: 'quarry',
            password: 'secret',
            sslMode: 'required',
            source: 'saved_profile',
        })

        await expect(service.listSchemas(session)).resolves.toEqual([
            { name: 'information_schema', isDefault: false },
            { name: 'warehouse', isDefault: true },
        ])
        expect(select).toHaveBeenCalledWith('SHOW DATABASES')
    })

    it('fails schema listing when no in-memory connect request exists for the session', async () => {
        await expect(
            service.listSchemas({
                target: {
                    connectionId: 'missing',
                    connectionName: 'Missing',
                    host: '127.0.0.1',
                    port: 3306,
                },
                source: 'saved_profile',
                connectedAt: 1,
            }),
        ).rejects.toThrow('MySQL connection request not found for Missing')
    })
})
