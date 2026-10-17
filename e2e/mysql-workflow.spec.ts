import { expect, test } from '@playwright/test'
import { useMysqlFixture } from './mysql-fixture'

test('connects to MySQL and exports a browsed table', async ({ page }) => {
    await useMysqlFixture(page)
    await page.goto('/')

    await page.getByLabel('Connection name').fill('E2E MySQL')
    await page.getByLabel('Host').fill('127.0.0.1')
    await page.getByLabel('Port').fill('3306')
    await page.getByLabel('Username').fill('root')
    await page.getByLabel('Password').fill('quarry')
    await page.getByLabel('Default database').fill('quarry_demo')
    await page.getByRole('button', { name: 'Save & connect' }).click()

    await expect(page.getByText('MySQL Workspace', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'products' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'products' }).first().click()
    await expect(page.getByText('2 rows')).toBeVisible()
    await expect(page.getByText('Laptop Pro 15"')).toBeVisible()

    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByRole('button', { name: 'CSV', exact: true }).click()
    await expect.poll(async () => page.evaluate(() => window.__quarryE2eWrites?.[0]?.ext)).toBe('csv')
    await expect.poll(async () => page.evaluate(() => window.__quarryE2eWrites?.[0]?.content)).toContain('Laptop Pro 15')

    await page.getByRole('button', { name: 'edit', exact: true }).click()
    await page.getByText('Laptop Pro 15"', { exact: true }).dblclick()
    await page.locator('input').fill('Laptop Pro 15 updated')
    await page.locator('input').press('Enter')
    await expect(page.getByText('Pending changes', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Apply all', exact: true }).click()
    await expect(page.getByText('Pending changes', { exact: true })).not.toBeVisible()
})

test('builds a pipeline on MySQL with the shared builder', async ({ page }) => {
    await useMysqlFixture(page)
    await page.goto('/')

    await page.getByLabel('Connection name').fill('E2E MySQL')
    await page.getByLabel('Host').fill('127.0.0.1')
    await page.getByLabel('Port').fill('3306')
    await page.getByLabel('Username').fill('root')
    await page.getByLabel('Password').fill('quarry')
    await page.getByLabel('Default database').fill('quarry_demo')
    await page.getByRole('button', { name: 'Save & connect' }).click()
    await page.getByRole('button', { name: 'products' }).first().click()

    await page.getByRole('button', { name: 'pipeline', exact: true }).click()
    await page.getByRole('button', { name: 'Add step' }).click()
    await page.getByRole('button', { name: /WHERE Filter rows/ }).click()
    await page.getByPlaceholder('e.g. price > 100').fill('products.price > 50')

    const sql = page.locator('pre').filter({ hasText: 'WHERE products.price > 50' })
    await expect(sql).toBeVisible()
    await expect(sql).toContainText('`quarry_demo`.`products`')
    await expect(sql).toContainText('step_1 AS `products`')
    await expect(page.getByTestId('step-flow')).toContainText('2 rows')
})
