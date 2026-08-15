import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
    await page.route('https://api.github.com/**', (route) => route.abort())
})

test('renders the public landing page and release fallback', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('Quarry — Visual SQLite query builder')
    await expect(page.locator('h1')).toContainText('Visual SQLite')
    await expect(page.locator('#hero-version')).toHaveText('v0.1.9')
    await expect(page.locator('#release-status')).toContainText('Could not load release info')

    const downloadCards = page.locator('#download a[data-asset]')
    await expect(downloadCards).toHaveCount(3)
    for (const card of await downloadCards.all()) {
        await expect(card).toHaveAttribute('href', 'https://github.com/dawichi/quarrydb/releases')
    }
})

test('interactive demo updates the pipeline, SQL, and result count', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('#demo-sql')).toHaveText('SELECT * FROM orders')
    await expect(page.locator('#demo-row-count')).toHaveText('15 rows')

    await page.locator('#btn-add-where').click()
    await expect(page.locator('#demo-sql')).toContainText("WHERE status = 'delivered'")
    await expect(page.locator('#demo-row-count')).toHaveText('8 rows')
    await expect(page.locator('#demo-steps')).toContainText('WHERE')

    await page.locator('#btn-add-orderby').click()
    await expect(page.locator('#demo-sql')).toContainText('ORDER BY total DESC')
    await expect(page.locator('#demo-row-count')).toHaveText('8 rows')

    await page.locator('#btn-reset').click()
    await expect(page.locator('#demo-sql')).toHaveText('SELECT * FROM orders')
    await expect(page.locator('#demo-row-count')).toHaveText('15 rows')
})
