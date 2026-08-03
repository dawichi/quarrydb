import { expect, test } from '@playwright/test'
import { useSqliteFixture } from './sqlite-fixture'

test.describe('SQLite golden path', () => {
    test.beforeEach(async ({ page }) => {
        await useSqliteFixture(page)
        await page.goto('/')
    })

    test('restores a workspace and browses a table', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'products' }).first()).toBeVisible()
        await expect(page.getByText('14 rows')).toBeVisible()
        await expect(page.getByText('Laptop Pro 15"')).toBeVisible()
    })

    test('builds and runs a WHERE pipeline with visible SQL', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'query', exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'query', exact: true }).click()

        await page.getByRole('button', { name: 'Add step' }).click()
        await page.getByRole('button', { name: /WHERE Filter rows/ }).click()
        await page.getByPlaceholder('e.g. price > 100').fill("category = 'Books'")

        await expect(page.locator('pre').filter({ hasText: "WHERE category = 'Books'" })).toBeVisible()
        await expect(page.getByText('Clean Code')).toBeVisible()
        await expect(page.getByText('The Pragmatic Programmer')).toBeVisible()
    })
})
