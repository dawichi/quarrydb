import { expect, test } from '@playwright/test'
import { useSqliteFixture } from './sqlite-fixture'

test.describe('SQLite edit and export workflows', () => {
    test.beforeEach(async ({ page }) => {
        await useSqliteFixture(page)
        await page.goto('/')
    })

    test('stages, reviews, and applies a row update', async ({ page }) => {
        await page.getByRole('button', { name: 'edit', exact: true }).click()
        await expect(page.getByText('Double-click a cell to edit')).toBeVisible()

        await page.locator('main td').filter({ hasText: 'Wireless Keyboard' }).dblclick()
        await page.locator('main td input').fill('Wireless Keyboard Pro')
        await page.locator('main td input').press('Enter')

        await expect(page.getByText('Pending changes')).toBeVisible()
        await expect(page.getByText('UPDATE', { exact: true })).toBeVisible()
        await expect(page.getByText(/name → Wireless Keyboard Pro/)).toBeVisible()

        await page.getByRole('button', { name: 'Apply all' }).click()
        await expect(page.getByText('Pending changes')).toBeHidden()
        await expect(page.getByText('Wireless Keyboard Pro')).toBeVisible()
    })

    test('exports the current table through the native-file boundary', async ({ page }) => {
        await page.getByRole('button', { name: 'Export', exact: true }).click()
        await page.getByRole('button', { name: /Spreadsheet.*\.csv/ }).click()

        await expect.poll(async () => page.evaluate(() => window.__quarryE2eWrites?.[0]?.ext)).toBe('csv')
        await expect.poll(async () => page.evaluate(() => window.__quarryE2eWrites?.[0]?.content)).toContain('Laptop Pro 15')
        await expect.poll(async () => page.evaluate(() => window.__quarryE2eWrites?.[0]?.content)).toContain('name,category')
    })
})
