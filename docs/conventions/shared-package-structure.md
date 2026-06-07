# `packages/shared` Structure

## No Barrel `index.ts`

`packages/shared/src/index.ts` currently holds every shared type in one flat file
(pipeline steps, schema, query results, workspace — split by `// ─── Section ───`
separators). When it eventually grows enough to need splitting into separate files,
**do not turn `index.ts` into a barrel that re-exports them**:

```typescript
// Bad — barrel re-export
export * from './pipeline'
export * from './schema'
export * from './workspace'
```

A barrel forces every consumer — the app, the landing demo, and TypeScript's own
incremental build — to load the *entire* module graph just to import one type. The
bigger this package gets, the slower editor and build performance gets, and the harder
it becomes to tell where a type actually lives.

## What to Do Instead

Give each domain file its own subpath export in `package.json`:

```json
"exports": {
    ".": "./src/index.ts",
    "./pipeline": "./src/pipeline.ts",
    "./schema": "./src/schema.ts"
}
```

Consumers then import directly from the domain they need:

```typescript
import type { PipelineStep } from '@quarrydb/shared/pipeline'
import type { TableSchema } from '@quarrydb/shared/schema'
```

Until a split is actually warranted, keep everything in the single flat `index.ts` — one
well-organized file beats a barrel wrapping several small ones.
