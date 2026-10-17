import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MysqlBackendAdapterService } from './mysql-backend-adapter.service'
import type { MysqlConnectRequest } from './mysql-connect-request'

const { client, connectSql } = vi.hoisted(() => {
    const client = {
        handle: 'mysql:mysql-1',
        query: vi.fn(),
        select: vi.fn(),
        execute: vi.fn(),
        batch: vi.fn(),
        close: vi.fn(async () => undefined),
    }
    return { client, connectSql: vi.fn(async () => client) }
})

vi.mock('../native/sql-client', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    connectSql,
}))

function request(overrides: Partial<MysqlConnectRequest['target']> = {}): MysqlConnectRequest {
    return {
        target: {
            connectionId: 'mysql-1',
            connectionName: 'Analytics',
            host: '127.0.0.1',
            port: 3306,
            defaultDatabase: 'quarry_demo',
            ...overrides,
        },
        username: 'quarry',
        password: 'secret word',
        sslMode: 'required',
        source: 'saved_profile',
    }
}

describe('MysqlBackendAdapterService', () => {
    let service: MysqlBackendAdapterService

    beforeEach(() => {
        service = new MysqlBackendAdapterService()
        for (const mock of [client.query, client.select, client.execute, client.batch, connectSql]) mock.mockClear()
        client.select.mockReset()
        client.query.mockReset()
        client.select.mockResolvedValue([{ ok: 1 }])
        client.batch.mockResolvedValue([])
    })

    it('opens a native pool with structured credentials instead of a DSN string', async () => {
        const session = await service.connect(request())

        expect(connectSql).toHaveBeenCalledWith({
            engine: 'mysql',
            connectionId: 'mysql-1',
            host: '127.0.0.1',
            port: 3306,
            username: 'quarry',
            password: 'secret word',
            database: 'quarry_demo',
            sslMode: 'required',
        })
        expect(session.target.connectionName).toBe('Analytics')
        expect(session.source).toBe('saved_profile')
    })

    it('rejects malformed host and port values before opening a connection', async () => {
        await expect(service.connect(request({ host: 'db.example.test/evil' }))).rejects.toThrow(
            'MySQL host must be a non-empty hostname or IP address',
        )
        await expect(service.connect(request({ port: 70_000 }))).rejects.toThrow(
            'MySQL port must be an integer between 1 and 65535',
        )
        expect(connectSql).not.toHaveBeenCalled()
    })

    it('fails clearly once a workspace connection has been released', async () => {
        const session = await service.connect(request())
        service.forgetConnection('mysql-1')

        await expect(service.listSchemas(session)).rejects.toThrow('MySQL connection is not open for Analytics')
        expect(client.close).toHaveBeenCalled()
    })

    it('applies staged edits as one transactional batch that rejects vanished targets', async () => {
        const session = await service.connect(request())

        await service.applyEdits(session, 'quarry_demo', 'products', [
            {
                kind: 'update',
                pkValues: { id: 7 },
                changes: { name: 'Updated product' },
                original: { id: 7, name: 'Old product' },
            },
            { kind: 'delete', pkValues: { id: 8 }, original: { id: 8, name: 'Deleted product' } },
            { kind: 'insert', values: { name: 'New product', price: '4.50' } },
        ])

        expect(client.batch).toHaveBeenCalledWith([
            {
                sql: 'UPDATE `quarry_demo`.`products` SET `name` = ? WHERE `id` = ?',
                params: ['Updated product', 7],
                expectRows: true,
            },
            { sql: 'DELETE FROM `quarry_demo`.`products` WHERE `id` = ?', params: [8], expectRows: true },
            {
                sql: 'INSERT INTO `quarry_demo`.`products` (`name`, `price`) VALUES (?, ?)',
                params: ['New product', '4.50'],
            },
        ])
    })

    it('loads large schemas in bounded metadata batches', async () => {
        const tableNames = Array.from({ length: 201 }, (_, index) => `table_${index}`)
        const session = await service.connect(request())
        client.select.mockImplementation(async (query: string, values?: unknown[]) => {
            if (query.includes('FROM information_schema.tables')) {
                return tableNames.map((table_name) => ({ table_name }))
            }
            const batchSize = (values?.length ?? 0) - 1
            return [
                {
                    table_name: tableNames[batchSize === 200 ? 0 : 200],
                    column_name: 'id',
                    column_type: 'int',
                    is_nullable: 'NO',
                    column_key: 'PRI',
                    column_default: null,
                },
            ]
        })

        const tables = await service.listTables(session, 'quarry_demo')

        expect(tables).toHaveLength(201)
        expect(client.select.mock.calls[2]?.[1]).toHaveLength(201)
        expect(client.select.mock.calls[3]?.[1]).toHaveLength(2)
        expect(tables.find((table) => table.name === 'table_0')?.columns).toHaveLength(1)
        expect(tables.find((table) => table.name === 'table_200')?.columns).toHaveLength(1)
    })

    it('sorts browse previews by the real column, so numbers sort as numbers', async () => {
        const session = await service.connect(request())
        client.select
            .mockResolvedValueOnce([
                { column_name: 'id', column_type: 'int', is_nullable: 'NO', column_key: 'PRI', column_default: null },
                {
                    column_name: 'total',
                    column_type: 'decimal(10,2)',
                    is_nullable: 'NO',
                    column_key: '',
                    column_default: '0.00',
                },
            ])
            .mockResolvedValueOnce([{ count: 10 }])
            .mockResolvedValueOnce([{ id: 1, total: 1389.98 }])

        await expect(
            service.queryTableRows(session, 'quarry_demo', 'orders', 10_000, 0, {
                filter: 'odd',
                sortColumn: 'total',
                sortDirection: 'desc',
            }),
        ).resolves.toEqual({ rows: [{ id: 1, total: 1389.98 }], columns: ['id', 'total'], total: 10 })

        expect(client.select).toHaveBeenLastCalledWith(
            'SELECT * FROM `quarry_demo`.`orders` WHERE CAST(`id` AS CHAR) LIKE ? OR CAST(`total` AS CHAR) LIKE ? ORDER BY `total` DESC LIMIT 500 OFFSET 0',
            ['%odd%', '%odd%'],
        )
    })

    it('runs ad-hoc queries unmodified and caps rows natively', async () => {
        const session = await service.connect(request())
        client.query.mockResolvedValueOnce({
            columns: ['id', 'id'],
            rows: [[1, 2]],
            truncated: false,
            durationMs: 1,
        })

        await expect(
            service.runQuery(session, 'SELECT o.id, c.id FROM orders o JOIN customers c ORDER BY o.id;', 10_000),
        ).resolves.toEqual({ kind: 'rows', rows: [{ id: 1, id_2: 2 }], columns: ['id', 'id'] })
        expect(client.query).toHaveBeenCalledWith(
            'SELECT o.id, c.id FROM orders o JOIN customers c ORDER BY o.id',
            [],
            500,
        )
    })
})
