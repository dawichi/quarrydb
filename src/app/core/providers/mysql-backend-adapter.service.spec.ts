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
            .mockResolvedValueOnce([{ table_name: 'products' }, { table_name: 'orders' }])
            .mockResolvedValueOnce([
                {
                    column_name: 'id',
                    column_type: 'int',
                    is_nullable: 'NO',
                    column_key: 'PRI',
                    column_default: '',
                },
                {
                    column_name: 'name',
                    column_type: 'varchar(255)',
                    is_nullable: 'NO',
                    column_key: '',
                    column_default: '',
                },
            ])
            .mockResolvedValueOnce([
                {
                    column_name: 'id',
                    column_type: 'int',
                    is_nullable: 'NO',
                    column_key: 'PRI',
                    column_default: '',
                },
                {
                    column_name: 'total',
                    column_type: 'decimal(10,2)',
                    is_nullable: 'NO',
                    column_key: '',
                    column_default: '0.00',
                },
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

        expect(select).toHaveBeenNthCalledWith(
            1,
            `SELECT CAST(table_name AS CHAR(255)) AS table_name
                 FROM information_schema.tables
                 WHERE table_schema = ?
                   AND table_type = 'BASE TABLE'
                 ORDER BY table_name`,
            ['quarry_demo'],
        )
        expect(select).toHaveBeenNthCalledWith(
            2,
            `SELECT CAST(column_name AS CHAR(255)) AS column_name,
                        CAST(column_type AS CHAR(255)) AS column_type,
                        CAST(is_nullable AS CHAR(3)) AS is_nullable,
                        CAST(column_key AS CHAR(3)) AS column_key,
                        CAST(COALESCE(column_default, '') AS CHAR(255)) AS column_default
                 FROM information_schema.columns
                 WHERE table_schema = ?
                   AND table_name = ?
                 ORDER BY ordinal_position`,
            ['quarry_demo', 'products'],
        )
        expect(select).toHaveBeenNthCalledWith(
            3,
            `SELECT CAST(column_name AS CHAR(255)) AS column_name,
                        CAST(column_type AS CHAR(255)) AS column_type,
                        CAST(is_nullable AS CHAR(3)) AS is_nullable,
                        CAST(column_key AS CHAR(3)) AS column_key,
                        CAST(COALESCE(column_default, '') AS CHAR(255)) AS column_default
                 FROM information_schema.columns
                 WHERE table_schema = ?
                   AND table_name = ?
                 ORDER BY ordinal_position`,
            ['quarry_demo', 'orders'],
        )
    })
})
