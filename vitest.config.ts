import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: [
            {
                find: '@quarrydb/shared/pipeline-sql',
                replacement: resolve(__dirname, './packages/shared/src/pipeline-sql.ts'),
            },
            {
                find: '@quarrydb/shared/sql-identifiers',
                replacement: resolve(__dirname, './packages/shared/src/sql-identifiers.ts'),
            },
            { find: '@quarrydb/shared', replacement: resolve(__dirname, './packages/shared/src/index.ts') },
        ],
    },
    test: {
        environment: 'node',
        include: ['src/**/*.spec.ts', 'packages/**/*.spec.ts'],
    },
})
