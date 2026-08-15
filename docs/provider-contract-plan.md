# Provider Contract Plan

This document defines the **TypeScript-facing contract** for Quarry's provider model. It was
written before implementation and remains a boundary reference; shipped behavior is tracked in
`docs/status.md` and the shared types under `packages/shared/`.

The goal is to answer a very specific question:

When Quarry stops meaning "SQLite app" and starts meaning "shared shell + providers," what
exact types and interfaces should exist, and which layer should own them?

This doc is intentionally about **contracts and boundaries**, not implementation details.

## Goal

Create a provider contract that is:

- explicit enough to guide the refactor of `WorkspaceStore`, `DatabaseService`, recent
  items, and session persistence
- narrow enough to avoid building a giant speculative abstraction layer
- split cleanly between **serializable shared types** and **app-local runtime interfaces**

## Core Rule

Do not put everything into `packages/shared`.

`packages/shared` should hold **serializable domain types** that are useful across package
boundaries. Runtime behavior such as callbacks, dependency injection contracts, Angular
services, icon components, and open/connect handlers should stay in the app.

That means:

- **Shared package**: ids, payload shapes, capability enums, recent-item data, workspace
  session payloads
- **App runtime**: provider definitions, registry wiring, UI factories, backend adapter
  instances, command handlers

## Layer Split

### Shared serializable types

These are candidates for `packages/shared`, likely split into dedicated subpath exports once
the package grows beyond the current single-file model:

- provider ids
- provider kind
- provider capability ids
- recent item shape
- persisted workspace/session payloads
- connection profile metadata shapes if they are purely data

### App-local runtime contracts

These should stay in the Angular app:

- provider registry entries
- open/connect actions
- provider-specific sidebar/view factories
- runtime backend adapter methods
- DI tokens / services
- icon/render references

This split matters because runtime contracts are not meaningfully reusable by the landing
site and should not be serialized into session state.

## Proposed Shared Types

These examples are illustrative. The exact names can shift, but the boundaries should not.

### Provider identity

```ts
export type ProviderId = 'sqlite' | 'mysql' | 'redis'

export type ProviderKind = 'relational' | 'key_value' | 'document'
```

Notes:

- Start with only shipped/active providers in the union.
- Redis is now implemented as a key/value provider and must remain outside relational adapter
  contracts. Add future providers only when their implementation actually begins.
- `ProviderKind` is useful for high-level grouping without pretending all relational or all
  non-relational providers share the same detailed UI.

### Capabilities

```ts
export type ProviderCapability =
    | 'recent_items'
    | 'server_connection'
    | 'relational_schema_browser'
    | 'sql_query_runner'
    | 'visual_sql_pipeline'
    | 'row_editor'
    | 'ddl_manager'
    | 'query_history'
    | 'export_results'
```

Notes:

- Capabilities should describe product-level features, not tiny helper methods.
- They are primarily for feature gating and shell decisions, not for replacing normal type
  checking inside a provider implementation.

### Recent items

```ts
export interface RecentItemBase {
    id: string
    providerId: ProviderId
    label: string
    subtitle?: string
    openedAt: number
}

export interface SqliteRecentItem extends RecentItemBase {
    providerId: 'sqlite'
    resource: {
        path: string
    }
}

export interface MysqlRecentItem extends RecentItemBase {
    providerId: 'mysql'
    resource: {
        connectionId: string
        host: string
        port: number
        defaultSchema?: string
    }
}

export interface RedisRecentItem extends RecentItemBase {
    providerId: 'redis'
    resource: {
        connectionId: string
        host: string
        port: number
        database: number
        tls: boolean
    }
}

export type RecentItem = SqliteRecentItem | MysqlRecentItem | RedisRecentItem
```

Notes:

- The recent item should hold enough data for the shell to display and reopen a resource.
- Secret material should not live here.
- The discriminated union keeps recent-item rendering honest without flattening everything
  to a generic string map.

### Persisted workspace/session payload

Quarry should persist the active workspace with an explicit provider id.

```ts
export interface PersistedWorkspaceSessionBase {
    providerId: ProviderId
    savedAt: number
}

export interface SqliteWorkspaceSession extends PersistedWorkspaceSessionBase {
    providerId: 'sqlite'
    workspace: {
        name: string
        databases: Array<{
            path: string
            alias: string
        }>
        selectedTable?: {
            alias: string
            tableName: string
        }
        activeTab?: 'browse' | 'query' | 'edit'
    }
}

export interface MysqlWorkspaceSession extends PersistedWorkspaceSessionBase {
    providerId: 'mysql'
    workspace: {
        connectionId: string
        selectedSchema?: string
        selectedTable?: {
            schema: string
            tableName: string
        }
        activeView?: 'browse' | 'query' | 'edit'
    }
}

export type PersistedWorkspaceSession = SqliteWorkspaceSession | MysqlWorkspaceSession
```

Notes:

- Persisted session payloads should be provider-owned, not forced into a universal
  workspace structure.
- The shell only needs to know that a session belongs to provider `X`; the provider owns
  the meaning of the payload.

### Connection profile metadata

If connection profiles become shared types, keep them metadata-only:

```ts
export interface MysqlConnectionProfile {
    id: string
    providerId: 'mysql'
    name: string
    host: string
    port: number
    username: string
    defaultSchema?: string
    sslMode?: 'disable' | 'prefer' | 'require'
    color?: string
    createdAt: number
    updatedAt: number
}
```

Notes:

- Passwords or tokens should not be mixed into ordinary metadata unless that storage
  decision is made deliberately and documented separately.

## Proposed App-Local Runtime Contracts

These contracts should stay in the app because they depend on runtime behavior.

### Provider definition

```ts
export interface ProviderDefinition {
    id: ProviderId
    kind: ProviderKind
    displayName: string
    capabilities: ProviderCapability[]
    createRecentItemLabel(input: unknown): { label: string; subtitle?: string }
    openFromHome(): Promise<void>
    restoreSession(session: PersistedWorkspaceSession): Promise<void>
}
```

That is the shape conceptually. The actual interface can be split into narrower pieces, but
the runtime provider definition should own:

- provider identity
- shell-visible metadata
- open/connect entrypoint
- session restoration hook
- capability declaration

It should not try to expose every provider feature through one giant god interface.

### Provider registry

```ts
export interface ProviderRegistry {
    get(id: ProviderId): ProviderDefinition
    list(): ProviderDefinition[]
}
```

This can be a simple app service. The important part is that shell code stops branching on
hard-coded SQLite assumptions and asks the registry which provider owns the current flow.

### Backend adapter

The backend adapter boundary should be provider-local. Do not force Redis and MySQL through
one fake universal query interface.

For the relational path, a reasonable first split is:

```ts
export interface RelationalBackendAdapter {
    listSchemas(): Promise<unknown[]>
    listTables(schema?: string): Promise<unknown[]>
    runQuery(sql: string): Promise<unknown>
    fetchTableRows(input: unknown): Promise<unknown>
}
```

And then provider-specific adapters implement the relational contract in their own terms:

- `SqliteBackendAdapter`
- `MysqlBackendAdapter`

Important:

- This is a **shared capability contract**, not the top-level provider contract.
- Only relational providers should implement it.
- Do not invent a fake adapter that claims Redis or Mongo can satisfy the same interface.

## Recommended File Ownership

If/when the shared package is split, a sensible direction is:

- `packages/shared/src/provider.ts`
  - `ProviderId`
  - `ProviderKind`
  - `ProviderCapability`
- `packages/shared/src/recent-item.ts`
  - `RecentItem`
  - provider-specific recent item payloads
- `packages/shared/src/session.ts`
  - persisted provider-owned workspace payloads
- `packages/shared/src/connection-profile.ts`
  - provider-specific connection metadata shapes

Per `docs/conventions/shared-package-structure.md`, these should be exposed via subpath
exports rather than a barrel re-export once the split is warranted.

## Refactor Targets in the Current App

These are the app areas this contract should directly unblock:

- `RecentFilesService` becomes a provider-aware recent-items service
- `SessionService` persists `providerId` + provider-owned session payload
- `WorkspaceStore` stops being the app-wide definition of all database state
- `DatabaseService` stops acting like the universal backend abstraction
- welcome/home UI stops assuming "open database" means "open SQLite file"

## What Not To Do

Avoid these traps:

- Do not make one giant `ProviderDefinition` interface with dozens of optional methods.
- Do not store callbacks/functions in `packages/shared`.
- Do not force provider workspace payloads into one flattened generic object.
- Do not treat capabilities as permission flags for every tiny UI branch.
- Do not add future providers to unions before work on them actually starts.

## Suggested Implementation Sequence

1. Introduce shared serializable provider/session/recent-item types.
2. Add an app-local provider registry with only `sqlite` registered at first.
3. Migrate session persistence and recent items to use `providerId`.
4. Extract the current SQLite open/restore logic behind the SQLite provider definition.
5. Add the MySQL provider definition only after the SQLite path works through the new
   contract.

This keeps the refactor incremental and testable.

## Success Criteria

This planning doc has done its job if implementation can answer these questions without
guessing:

- Which types belong in `packages/shared`?
- Which contracts stay app-local?
- How does a recent item identify its provider?
- How is persisted workspace state discriminated by provider?
- How does the shell find the runtime owner for open/restore flows?
- Where does a relational shared adapter stop, and provider-specific logic begin?

The concrete file-by-file rollout plan for applying these contracts to the current app is
captured in `docs/provider-refactor-checklist.md`.

## Related

- `multi-engine-architecture.md`
- `mysql-provider-plan.md`
- `roadmap.md`
- `architecture.md`
- `conventions/shared-package-structure.md`
- `provider-refactor-checklist.md`
