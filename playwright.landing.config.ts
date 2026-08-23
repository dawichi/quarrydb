import { defineConfig, devices } from '@playwright/test'

const landingPort = process.env.QUARRY_LANDING_PORT ?? '4323'
const landingUrl = `http://127.0.0.1:${landingPort}`

export default defineConfig({
    testDir: './landing-e2e',
    outputDir: 'test-results/landing',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: landingUrl,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    webServer: {
        command: `bun run --cwd landing build && bun run --cwd landing preview --host 127.0.0.1 --port ${landingPort}`,
        url: landingUrl,
        reuseExistingServer: process.env.QUARRY_REUSE_LANDING_SERVER === '1',
        timeout: 120_000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
})
