import { expect, test } from '@playwright/test'

test.describe('accessibility smoke checks', () => {
    test('names welcome form controls and supports keyboard navigation', async ({ page }) => {
        await page.goto('/')
        await expect(page.getByRole('heading', { name: 'Quarry' })).toBeVisible()

        const unnamedControls = await page.locator('input, textarea, select').evaluateAll((controls) =>
            controls
                .filter((control) => {
                    if (
                        control.getAttribute('aria-label') ||
                        control.getAttribute('aria-labelledby') ||
                        control.closest('label')
                    ) {
                        return false
                    }
                    const id = control.getAttribute('id')
                    return !id || !Array.from(document.querySelectorAll('label')).some((label) => label.htmlFor === id)
                })
                .map((control) => control.outerHTML),
        )

        expect(unnamedControls).toEqual([])

        const connectionName = page.getByLabel('Connection name')
        const host = page.getByLabel('Host')
        await connectionName.focus()
        await expect(connectionName).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(host).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(connectionName).toBeFocused()
    })
})
