import { describe, expect, it } from 'vitest'
import { MysqlSampleDataService } from './mysql-sample-data.service'

describe('MysqlSampleDataService', () => {
    it('builds the expected sample schema tables', () => {
        const service = new MysqlSampleDataService()

        expect(service.buildCreateTableStatements('quarry_demo')).toEqual(
            expect.arrayContaining([
                expect.stringContaining('CREATE TABLE IF NOT EXISTS `quarry_demo`.`products`'),
                expect.stringContaining('CREATE TABLE IF NOT EXISTS `quarry_demo`.`customers`'),
                expect.stringContaining('CREATE TABLE IF NOT EXISTS `quarry_demo`.`orders`'),
                expect.stringContaining('CREATE TABLE IF NOT EXISTS `quarry_demo`.`order_items`'),
            ]),
        )
    })
})
