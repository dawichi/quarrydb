import { describe, expect, it } from 'vitest'
import { ExportService } from './export.service'

describe('ExportService SQL inserts', () => {
    it('uses the selected dialect for qualified MySQL identifiers', () => {
        const service = new ExportService()

        expect(service.toSqlInserts('warehouse.orders', ['odd`column'], [{ 'odd`column': "O'Reilly" }], 'mysql')).toBe(
            "INSERT INTO `warehouse`.`orders` (`odd``column`) VALUES ('O''Reilly');",
        )
    })

    it('keeps SQLite output compatible with the existing export format', () => {
        const service = new ExportService()

        expect(service.toSqlInserts('orders', ['id'], [{ id: 1 }])).toBe('INSERT INTO "orders" ("id") VALUES (1);')
    })
})
