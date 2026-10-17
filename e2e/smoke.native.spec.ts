import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { useNativeBridge } from './native-bridge'

// Release smoke test against the real Rust layer. Needs the bridge running
// (`cargo test --lib ui_bridge -- --ignored`) and `bun run dev:services:up`.
test.skip(!process.env.QUARRY_BRIDGE, 'set QUARRY_BRIDGE=1 with the ui_bridge test running')
test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 5000 })

const dir = `/tmp/quarry-smoke/${Date.now()}`
mkdirSync(dir, { recursive: true })
const readCsvs = () =>
    readdirSync(dir)
        .filter((file) => file.endsWith('.csv'))
        .map((file) => readFileSync(`${dir}/${file}`, 'utf8'))
        .join('\n')
const sqlite = (sql: string) => execFileSync('sqlite3', [`${dir}/quarry-sample.db`, sql], { encoding: 'utf8' })

test('sqlite sample: WHERE → JOIN → GROUP BY, reorder, undo/redo', async ({ page }) => {
    await useNativeBridge(page, dir)
    await page.goto('/')
    await page.getByRole('button', { name: 'Create sample SQLite database' }).click()
    await page.getByRole('button', { name: 'orders' }).first().click()
    await expect(page.getByText('15 rows')).toBeVisible()
    await page.getByRole('button', { name: /^(query|pipeline)$/ }).click()

    await page.getByRole('button', { name: 'Add step' }).click()
    await page.getByRole('button', { name: /WHERE Filter rows/ }).click()
    await page.getByPlaceholder('e.g. price > 100').fill("status != 'cancelled'")
    await expect(page.getByTestId('step-flow').nth(0)).toContainText(/15 →\s*14\s*rows/)

    await page.getByRole('button', { name: 'Add step' }).click()
    await page.getByRole('button', { name: /JOIN Combine tables/ }).click()
    await page.locator('select').filter({ hasText: 'Pick a table…' }).last().selectOption('customers')
    // Picking the table suggests the ON condition from foreign-key naming.
    await expect(page.locator('textarea').last()).toHaveValue('orders.customer_id = customers.id')
    await expect(page.getByTestId('step-flow').nth(1)).toContainText(/14\s*rows/)

    await page.getByRole('button', { name: 'Add step' }).click()
    await page.getByRole('button', { name: /GROUP BY Aggregate/ }).click()
    const groupBy = page.locator('app-step-card').filter({ hasText: 'Click columns above to group by them' })
    await groupBy.getByRole('button', { name: 'country', exact: true }).click()
    await groupBy.getByRole('button', { name: 'Add aggregation' }).click()
    await expect(page.getByTestId('step-flow').nth(2)).toContainText(/14 →\s*9\s*rows/)
    await expect(page.getByText('South Korea').last()).toBeVisible()
    await page.screenshot({ path: `${dir}/02-pipeline.png`, fullPage: true })
    await expect(page.locator('pre').last()).toContainText('GROUP BY "country"')

    // Reorder: drag GROUP BY above JOIN, then undo and redo.
    const grips = page.getByTitle('Drag to reorder')
    await expect(grips).toHaveCount(3)
    const from = await grips.nth(2).boundingBox()
    const to = await grips.nth(1).boundingBox()
    if (!from || !to) throw new Error('no grip boxes')
    await page.mouse.move(from.x + 5, from.y + 5)
    await page.mouse.down()
    await page.mouse.move(to.x + 5, to.y + 5, { steps: 10 })
    await page.mouse.up()
    // GROUP BY now runs before the JOIN that supplies `country`, so it must say so.
    await expect(page.getByText('Column "country" isn\'t available at this step')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('step-flow').nth(2)).toContainText(/14 →\s*9\s*rows/)
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(page.getByText('Column "country" isn\'t available at this step')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('step-flow').nth(2)).toContainText(/14 →\s*9\s*rows/)

    // Export the pipeline result as CSV through the real write_text_file.
    await page.getByRole('button', { name: 'Export', exact: true }).last().click()
    await page.getByRole('button', { name: /Spreadsheet.*\.csv/ }).click()
    await expect.poll(() => readCsvs()).toContain('South Korea,1')

    // Stage one edit and apply it, stage another and discard it.
    await page.getByRole('button', { name: 'products' }).first().click()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByRole('cell', { name: 'Wireless Keyboard', exact: true }).dblclick()
    await page.locator('td input').fill('Wireless Keyboard Pro')
    await page.locator('td input').press('Enter')
    await page.getByRole('button', { name: 'Apply all' }).click()
    await expect(page.getByText('Pending changes')).toBeHidden()
    await page.getByRole('cell', { name: 'USB-C Hub 7-port', exact: true }).dblclick()
    await page.locator('td input').fill('should be discarded')
    await page.locator('td input').press('Enter')
    await page.getByRole('button', { name: 'Discard all' }).click()
    await expect(page.getByText('Pending changes')).toBeHidden()
    const names = sqlite("SELECT name FROM products WHERE name LIKE 'Wireless%' OR name LIKE 'USB-C%' OR name LIKE 'should%'")
    expect(names).toContain('Wireless Keyboard Pro')
    expect(names).not.toContain('should be discarded')
})

const mysql = (sql: string) =>
    execFileSync('docker', ['exec', 'quarry-mysql', 'mysql', '-uroot', '-pquarry', '-N', '-e', sql], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    })

async function connectMysql(page: import('@playwright/test').Page): Promise<void> {
    await page.getByLabel('Connection name').fill('Smoke MySQL')
    await page.getByLabel('Host').fill('127.0.0.1')
    await page.getByLabel('Port').fill('3306')
    await page.getByLabel('Username').fill('root')
    await page.getByLabel('Password').fill('quarry')
    await page.getByLabel('Default database').fill('quarry_demo')
    await page.getByRole('button', { name: 'Save & connect' }).click()
    await expect(page.getByText('MySQL Workspace', { exact: true })).toBeVisible()
}

test('mysql: sample data, sort by price, pipeline, reconnect', async ({ page }) => {
    mysql('DROP DATABASE IF EXISTS quarry_demo; CREATE DATABASE quarry_demo')
    await useNativeBridge(page, dir)
    await page.goto('/')
    await connectMysql(page)
    await page.getByRole('button', { name: /Load sample data into/ }).click()
    await expect(page.getByRole('button', { name: 'products' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'products' }).first().click()

    await page.getByLabel('Sort by').selectOption('price')
    await page.getByLabel('Direction').selectOption('desc')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.locator('tbody tr').first()).toContainText('1299.99')
    await page.screenshot({ path: `${dir}/10-mysql-sorted.png` })
    const prices = await page.locator('tbody tr').evaluateAll((rows) =>
        rows.slice(0, 5).map((row) => row.textContent?.match(/\d+\.\d{2}/)?.[0]),
    )
    const numeric = prices.map(Number)
    expect(numeric).toEqual([...numeric].sort((a, b) => b - a))

    await page.getByRole('button', { name: 'pipeline', exact: true }).click()
    await page.getByRole('button', { name: 'Add step' }).click()
    await page.getByRole('button', { name: /WHERE Filter rows/ }).click()
    await page.getByPlaceholder('e.g. price > 100').fill('products.price > 100')
    const expected = mysql('SELECT COUNT(*) FROM quarry_demo.products WHERE price > 100').trim()
    await expect(page.getByTestId('step-flow').first()).toContainText(new RegExp(`→\\s*${expected}\\s*rows`))
    await page.screenshot({ path: `${dir}/11-mysql-pipeline.png` })

    await page.getByText('Back to Home').click()
    await page.getByRole('button', { name: /Smoke MySQL/ }).first().click()
    await expect(page.getByText('MySQL Workspace', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'products' }).first()).toBeVisible()

    // Relaunch: the session restores.
    await expect
        .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('quarry_session') ?? '{}').providerId))
        .toBe('mysql')
    await page.reload()
    await expect(page.getByText(/MySQL connection restored. Re-enter the password/).first()).toBeVisible()
})

test('redis: connect, run a safe command, open the key', async ({ page }) => {
    await useNativeBridge(page, dir)
    await page.goto('/')
    await page.getByRole('button', { name: 'Connect to Redis' }).click()
    await page.locator('#redis-connection-name').fill('Smoke Redis')
    await page.locator('#redis-host').fill('127.0.0.1')
    await page.locator('#redis-port').fill('6379')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await page.getByRole('button', { name: 'Command runner' }).click()
    await page.locator('#redis-command').fill('SET quarry:smoke "hello from the smoke test" EX 300')
    await page.getByRole('button', { name: 'Run command' }).click()
    await expect(page.locator('pre').last()).toContainText('OK')
    await page.getByRole('button', { name: 'Key browser' }).click()
    await page.getByLabel('Key scan pattern').fill('quarry:*')
    await page.getByLabel('Key scan pattern').press('Enter')
    await page.getByRole('button', { name: 'Scan' }).click()
    await page.getByRole('button', { name: 'quarry:smoke' }).last().click()
    await expect(page.locator('#redis-string-value')).toHaveValue('hello from the smoke test')
    await page.screenshot({ path: `${dir}/21-redis-key.png` })
})

test('diagnostics: report has no credentials or data', async ({ page }) => {
    await useNativeBridge(page, dir)
    await page.goto('/')
    await connectMysql(page)
    await page.getByRole('button', { name: 'products' }).first().click()
    await expect(page.getByText('Laptop Pro 15"').first()).toBeVisible()
    await page.evaluate(() => (window as unknown as { __quarryEmit: (event: string) => void }).__quarryEmit('menu:export-diagnostics'))
    const file = `${dir}/quarry-diagnostics.json`
    await expect.poll(() => existsSync(file)).toBe(true)
    const report = readFileSync(file, 'utf8')
    expect(report).not.toContain('quarry"')
    expect(report).not.toMatch(/password"\s*:\s*"[^"]/i)
    expect(report).not.toContain('Laptop Pro')
})
