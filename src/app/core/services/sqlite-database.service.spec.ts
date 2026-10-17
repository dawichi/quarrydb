import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SqliteDatabaseService } from './sqlite-database.service'

const { select, connectSql } = vi.hoisted(() => {
    const select = vi.fn()
    const connectSql = vi.fn(async () => ({ select }))
    return { select, connectSql }
})

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('../native/sql-client', () => ({ connectSql }))

describe('SqliteDatabaseService', () => {
    let service: SqliteDatabaseService

    beforeEach(() => {
        service = new SqliteDatabaseService()
        select.mockReset()
    })

    it('caps table browse previews at 500 rows', async () => {
        select.mockResolvedValueOnce([{ count: 600 }]).mockResolvedValueOnce([{ id: 1 }])

        await expect(service.queryRows('warehouse.db', 'products', 10_000, 0)).resolves.toEqual({
            rows: [{ id: 1 }],
            total: 600,
        })

        expect(select).toHaveBeenNthCalledWith(2, 'SELECT * FROM "products" LIMIT ? OFFSET ?', [500, 0])
    })

    it('caps query previews while keeping full-result exports separate', async () => {
        select.mockResolvedValueOnce([{ count: 600 }]).mockResolvedValueOnce([{ id: 1 }])

        await service.executeQuery('warehouse.db', 'SELECT * FROM products', 10_000)

        expect(select).toHaveBeenNthCalledWith(
            2,
            'SELECT * FROM (SELECT * FROM products) AS quarry_preview LIMIT ?',
            [500],
        )
    })
})
