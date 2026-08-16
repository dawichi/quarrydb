import { describe, expect, it } from 'vitest'
import { buildDiagnosticsReport } from './diagnostics.service'

const input = {
    activeProviderId: 'mysql' as const,
    open: true,
    hasError: true,
    sqlite: { open: false, schemaCount: 0, tableOpen: false, activeTab: 'browse' },
    mysql: { connected: true, schemaCount: 3, tableOpen: true, activeTab: 'query' },
    redis: { connected: false, loadedKeyCount: 0, activeTab: 'keys' },
}

describe('buildDiagnosticsReport', () => {
    it('builds a useful report without accepting sensitive provider data', () => {
        const report = buildDiagnosticsReport(
            input,
            '0.2.0',
            'macOS',
            'QuarryTest/1.0',
            new Date('2026-08-16T12:00:00.000Z'),
        )

        expect(report).toMatchObject({
            formatVersion: 1,
            generatedAt: '2026-08-16T12:00:00.000Z',
            app: { name: 'Quarry', version: '0.2.0' },
            runtime: { platform: 'macOS', userAgent: 'QuarryTest/1.0' },
            workspace: { activeProviderId: 'mysql', open: true, hasError: true },
            providers: { mysql: { connected: true, schemaCount: 3, tableOpen: true, activeTab: 'query' } },
        })
        expect(report).not.toHaveProperty('password')
        expect(JSON.stringify(report)).not.toContain('secret')
    })
})
