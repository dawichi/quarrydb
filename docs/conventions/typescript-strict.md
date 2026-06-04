# TypeScript Strict Typing

## No `any`

Avoid `any` at all costs. If it's temporarily unavoidable, mark it:

```typescript
// TODO: type this properly once the API shape is confirmed
const raw: any = response.data
```

## Explicit Types

Always type function parameters and return values explicitly.

```typescript
// Good
function buildCte(steps: PipelineStep[]): string { ... }

// Bad
function buildCte(steps): any { ... }
```

## Type Imports

Use `import type` when importing only types — cleaner bundle, clearer intent.

```typescript
import type { Pipeline, PipelineStep } from '@quarrydb/shared'
import type { QueryResult } from '../../core/types'
```

## Prefer Interfaces Over Type Aliases for Objects

```typescript
// Prefer
interface StepConfig {
    id: string
    type: StepType
}

// Use type aliases for unions and computed types
type StepType = 'WHERE' | 'SELECT' | 'ORDER_BY'
```

## Discriminated Unions Over Optional Fields

```typescript
// Good — discriminated union
type PipelineStep = WhereStep | SelectStep | RawSqlStep

// Bad — optional fields that may or may not exist
interface PipelineStep {
    type: string
    expression?: string
    sql?: string
}
```
