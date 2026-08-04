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

    await expect(page.getByText('MySQL Preview', { exact: true })).toBeVisible()
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
