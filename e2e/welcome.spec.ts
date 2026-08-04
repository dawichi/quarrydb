import { expect, test } from '@playwright/test'

test.describe('welcome screen', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await expect(page.getByRole('heading', { name: 'Quarry' })).toBeVisible()
    })

    test('offers SQLite and MySQL provider entry points', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Open SQLite file' })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Connect to MySQL' })).toBeVisible()
        await expect(
            page.getByText('Preview quality: browse, stage row edits, export results, and run raw SQL; visual pipelines remain SQLite-only.'),
        ).toBeVisible()
    })

    test('allows filling a MySQL connection profile', async ({ page }) => {
        await page.getByLabel('Connection name').fill('E2E MySQL')
        await page.getByLabel('Host').fill('127.0.0.1')
        await page.getByLabel('Port').fill('3306')
        await page.getByLabel('Username').fill('root')
        await page.getByLabel('Password').fill('quarry')

        await expect(page.getByLabel('Connection name')).toHaveValue('E2E MySQL')
        await expect(page.getByLabel('Host')).toHaveValue('127.0.0.1')
        await expect(page.getByLabel('Port')).toHaveValue('3306')
        await expect(page.getByLabel('Username')).toHaveValue('root')
        await expect(page.getByLabel('Password')).toHaveValue('quarry')
    })

    test('allows saving a MySQL profile without a default database', async ({ page }) => {
        await page.getByLabel('Connection name').fill('Server Only')
        await page.getByLabel('Host').fill('127.0.0.1')
        await page.getByLabel('Username').fill('root')

        await expect(page.getByRole('button', { name: 'Save profile' })).toBeEnabled()
        await expect(page.getByRole('button', { name: 'Save & connect' })).toBeEnabled()
    })

    test('shows an empty recent-items state on a fresh browser profile', async ({ page }) => {
        await expect(page.getByText('No recent items')).toBeVisible()
    })
})
