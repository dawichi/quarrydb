import { describe, expect, it } from 'vitest'
import { MysqlSampleDataService } from './mysql-sample-data.service'

describe('MysqlSampleDataService', () => {
    it('builds the expected sample schema tables', () => {
        const service = new MysqlSampleDataService()

        expect(service.buildCreateTableStatements()).toEqual(
            expect.arrayContaining([
                expect.stringContaining('CREATE TABLE IF NOT EXISTS products'),
                expect.stringContaining('CREATE TABLE IF NOT EXISTS customers'),
                expect.stringContaining('CREATE TABLE IF NOT EXISTS orders'),
                expect.stringContaining('CREATE TABLE IF NOT EXISTS order_items'),
            ]),
        )
    })
})
