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

    it('lists tables and their columns from a selected schema', async () => {
        select
            .mockResolvedValueOnce([{ Tables_in_quarry_demo: 'products' }, { Tables_in_quarry_demo: 'orders' }])
            .mockResolvedValueOnce([
                { Field: 'id', Type: 'int', Null: 'NO', Key: 'PRI', Default: null },
                { Field: 'name', Type: 'varchar(255)', Null: 'NO', Key: '', Default: null },
            ])
            .mockResolvedValueOnce([
                { Field: 'id', Type: 'int', Null: 'NO', Key: 'PRI', Default: null },
                { Field: 'total', Type: 'decimal(10,2)', Null: 'NO', Key: '', Default: '0.00' },
            ])

        const session = await service.connect({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: '127.0.0.1',
                port: 3306,
                defaultDatabase: 'quarry_demo',
            },
            username: 'quarry',
            password: 'secret',
            sslMode: 'required',
            source: 'saved_profile',
        })

        await expect(service.listTables(session, 'quarry_demo')).resolves.toEqual([
            {
                schemaName: 'quarry_demo',
                name: 'orders',
                columns: [
                    { name: 'id', type: 'int', nullable: false, primaryKey: true, defaultValue: undefined },
                    {
                        name: 'total',
                        type: 'decimal(10,2)',
                        nullable: false,
                        primaryKey: false,
                        defaultValue: '0.00',
                    },
                ],
            },
            {
                schemaName: 'quarry_demo',
                name: 'products',
                columns: [
                    { name: 'id', type: 'int', nullable: false, primaryKey: true, defaultValue: undefined },
                    {
                        name: 'name',
                        type: 'varchar(255)',
                        nullable: false,
                        primaryKey: false,
                        defaultValue: undefined,
                    },
                ],
            },
        ])

        expect(select).toHaveBeenNthCalledWith(1, 'SHOW TABLES FROM `quarry_demo`')
        expect(select).toHaveBeenNthCalledWith(2, 'SHOW COLUMNS FROM `quarry_demo`.`products`')
        expect(select).toHaveBeenNthCalledWith(3, 'SHOW COLUMNS FROM `quarry_demo`.`orders`')
    })
})
