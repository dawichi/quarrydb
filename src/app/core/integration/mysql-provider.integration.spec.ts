import { type Connection, createConnection, type RowDataPacket } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { MysqlDatabaseClient } from '../providers/mysql-backend-adapter'
import { MysqlBackendAdapterService } from '../providers/mysql-backend-adapter.service'

const describeMysql = process.env.QUARRY_MYSQL_INTEGRATION === '1' ? describe : describe.skip

class Mysql2BackendAdapterService extends MysqlBackendAdapterService {
    private readonly connections: Connection[] = []

    protected override async loadDatabase(dsn: string): Promise<MysqlDatabaseClient> {
        const connection = await createConnection(dsn)
        this.connections.push(connection)

        return {
            select: async <T>(query: string, bindValues?: unknown[]) => {
                const [rows] = await connection.query<RowDataPacket[]>(query, bindValues)
                return rows as T
            },
            execute: async (query: string, bindValues?: unknown[]) => {
                const [result] = await connection.execute(query, bindValues)
                return {
                    rowsAffected: result.affectedRows,
                    lastInsertId: result.insertId,
                }
            },
            close: async () => {
                await connection.end()
                const index = this.connections.indexOf(connection)
                if (index >= 0) {
                    this.connections.splice(index, 1)
                }
            },
        }
    }

    async closeAll(): Promise<void> {
        await Promise.all(this.connections.map((connection) => connection.end()))
        this.connections.length = 0
    }
}

describeMysql('MySQL provider against a real MySQL server', () => {
    let service: Mysql2BackendAdapterService
    let session: Awaited<ReturnType<Mysql2BackendAdapterService['connect']>>

    beforeAll(async () => {
        service = new Mysql2BackendAdapterService()
        session = await service.connect({
            target: {
                connectionId: 'mysql-integration',
                connectionName: 'MySQL integration',
                host: process.env.QUARRY_MYSQL_HOST ?? '127.0.0.1',
                port: Number(process.env.QUARRY_MYSQL_PORT ?? 3306),
                defaultDatabase: process.env.QUARRY_MYSQL_DATABASE ?? 'quarry_demo',
            },
            username: process.env.QUARRY_MYSQL_USER ?? 'root',
            password: process.env.QUARRY_MYSQL_PASSWORD ?? 'quarry',
            source: 'saved_profile',
        })

        await service.runQuery(session, 'DROP TABLE IF EXISTS `quarry_demo`.`order_items`', 100)
        await service.runQuery(session, 'DROP TABLE IF EXISTS `quarry_demo`.`orders`', 100)
        await service.runQuery(session, 'DROP TABLE IF EXISTS `quarry_demo`.`customers`', 100)
        await service.runQuery(session, 'DROP TABLE IF EXISTS `quarry_demo`.`products`', 100)
    })

    afterAll(async () => {
        await service.closeAll()
    })

    it('discovers the configured schema and seeded table metadata', async () => {
        const schemas = await service.listSchemas(session)
        expect(schemas).toContainEqual({ name: 'quarry_demo', isDefault: true })

        expect(await service.seedSampleData(session, 'quarry_demo')).toBe(true)

        const tables = await service.listTables(session, 'quarry_demo')
        expect(tables.map((table) => table.name)).toEqual(['customers', 'order_items', 'orders', 'products'])

        const products = tables.find((table) => table.name === 'products')
        expect(products?.columns).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'id', primaryKey: true, nullable: false }),
                expect.objectContaining({ name: 'price', type: 'decimal(10,2)', nullable: false }),
            ]),
        )
    })

    it('loads paged rows while normalizing MySQL preview-only decimal values', async () => {
        const result = await service.queryTableRows(session, 'quarry_demo', 'products', 3, 2)

        expect(result.total).toBe(14)
        expect(result.rows).toHaveLength(3)
        expect(result.columns).toContain('price')
        expect(typeof result.rows[0]?.['price']).toBe('string')
    })

    it('runs raw expression and joined queries with preview limits', async () => {
        await expect(service.runQuery(session, 'SELECT NOW() AS now_value;', 100)).resolves.toMatchObject({
            kind: 'rows',
            columns: ['now_value'],
        })

        const result = await service.runQuery(
            session,
            `SELECT customers.name, orders.total
             FROM \`quarry_demo\`.\`customers\`
             JOIN \`quarry_demo\`.\`orders\` ON orders.customer_id = customers.id
             ORDER BY orders.id`,
            4,
        )

        expect(result.kind).toBe('rows')
        expect(result.rows).toHaveLength(4)
        expect(result.columns).toEqual(['name', 'total'])
    })

    it('fetches full table and query results for export', async () => {
        const table = await service.fetchTableRows(session, 'quarry_demo', 'products')
        expect(table.rows).toHaveLength(14)
        expect(table.columns).toEqual(['id', 'name', 'category', 'price', 'stock'])

        const query = await service.runQueryFull(
            session,
            'SELECT customer_id, total FROM `quarry_demo`.`orders` ORDER BY id LIMIT 2',
        )
        expect(query).toHaveLength(2)
        expect(Object.keys(query[0] ?? {})).toEqual(['customer_id', 'total'])
    })
})
