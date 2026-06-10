# Provider Refactor Checklist

This document turns the provider architecture plan into a **concrete rollout checklist**
against the current Quarry codebase.

It is intentionally implementation-oriented. The goal is to make the first provider
refactor incremental, testable, and hard to lose scope on.

## Goal

Move Quarry from:

- one app-wide SQLite-shaped store
- one SQLite-specific backend service treated as universal
- one recent-files model
- one SQLite session shape

to:

- a shared shell
- provider-aware recent items and session restore
- an explicit SQLite provider boundary
- a codebase that can accept MySQL without a rewrite

## Current File Map

These are the main files that currently encode SQLite as the app-wide default:

- [src/app/core/store/workspace.store.ts](/Users/dawichi/Documents/GitHub/quarrydb/src/app/core/store/workspace.store.ts:1)
  - currently owns both shell state and SQLite workspace behavior
- [src/app/core/services/database.service.ts](/Users/dawichi/Documents/GitHub/quarrydb/src/app/core/services/database.service.ts:1)
  - currently acts as the SQLite backend and file picker
- [src/app/core/services/session.service.ts](/Users/dawichi/Documents/GitHub/quarrydb/src/app/core/services/session.service.ts:1)
  - persists a SQLite-only session payload
- [src/app/core/services/recent-files.service.ts](/Users/dawichi/Documents/GitHub/quarrydb/src/app/core/services/recent-files.service.ts:1)
  - persists recent SQLite file paths only
- [src/app/features/welcome/welcome.component.ts](/Users/dawichi/Documents/GitHub/quarrydb/src/app/features/welcome/welcome.component.ts:1)
  - assumes the home screen loads recent SQLite files
- [src/app/core/services/menu.service.ts](/Users/dawichi/Documents/GitHub/quarrydb/src/app/core/services/menu.service.ts:1)
  - menu actions assume "open database" means SQLite file open

These files are not wrong. They are just the first refactor seam.

## Refactor Principles

1. Do not break the current SQLite UX while introducing the provider shell.
2. Do not build MySQL support inside SQLite-shaped services.
3. Do not try to rewrite every store/service at once.
4. Keep the SQLite provider fully functional at every checkpoint.
5. Prefer additive extraction over destructive replacement.

## Phase 1 — Introduce Shared Provider Data Types

Purpose: make provider identity explicit in persisted data before touching large UI flows.

Checklist:

- Add shared serializable types described in `provider-contract-plan.md`
  - `ProviderId`
  - `ProviderCapability`
  - provider-aware `RecentItem`
  - provider-aware persisted workspace/session payload
- Keep the initial provider union narrow
  - `sqlite`
  - optionally `mysql` only if the MySQL planning types are already being introduced
- Avoid runtime behavior in `packages/shared`

Expected impact:

- no user-facing behavior change
- mostly type-layer groundwork

## Phase 2 — Replace Recent Files With Recent Items

Purpose: remove the first obvious SQLite-global assumption from the shell.

### Current state

`RecentFilesService` stores:

- file `path`
- derived `name`
- `openedAt`

That shape only works for SQLite file opens.

### Target state

Replace `RecentFilesService` with a provider-aware service such as `RecentItemsService`.

Checklist:

- introduce provider-aware storage key and payload
- migrate current SQLite recent files into `RecentItem` form
- add a small migration path if preserving existing localStorage matters
- keep the API narrow
  - `load()`
  - `add(item)`
  - `remove(id or discriminator)`
- update welcome screen to render provider-aware recent items
- keep the initial UI simple
  - provider icon
  - label
  - subtitle

Files affected first:

- `src/app/core/services/recent-files.service.ts`
- `src/app/features/welcome/welcome.component.ts`
- welcome template

Suggested rename target:

- `recent-items.service.ts`

## Phase 3 — Make Session Persistence Provider-Aware

Purpose: stop treating the SQLite session payload as the global app session shape.

### Current state

`SessionService` currently serializes:

- SQLite database paths/aliases
- SQLite table selection
- SQLite pipeline state

### Target state

`SessionService` should persist:

- `providerId`
- provider-owned workspace payload
- provider-owned active selection payload
- provider-owned feature state where relevant

Checklist:

- introduce a provider-aware discriminated session union
- keep SQLite as the only implemented restore path at first
- make restore dispatch through provider identity
- clear invalid sessions per provider rather than assuming one global SQLite failure mode

Files affected first:

- `src/app/core/services/session.service.ts`
- `src/app/core/store/workspace.store.ts`
- `src/app/core/store/pipeline.store.ts` only if the pipeline restore hook needs signature changes

Important constraint:

- the shell should know which provider owns the session
- the provider should know how to interpret the payload

## Phase 4 — Extract a Provider Registry

Purpose: create one runtime place where the shell can ask "who owns this flow?"

### Current state

Shell-level flows call SQLite methods directly:

- menu open action calls `workspaceStore.openDatabase()`
- welcome/tutorial flows call SQLite-specific methods

### Target state

Introduce an app-local provider registry with only one registered provider at first:

- `sqlite`

Checklist:

- create `ProviderRegistry` app service
- create `SqliteProviderDefinition`
- move shell-facing open/reopen/restore entrypoints behind that definition
- keep methods thin initially; do not force every SQLite behavior into the provider on day one

Files affected first:

- new provider registry files under `src/app/core/providers/` or similar
- `src/app/core/services/menu.service.ts`
- `src/app/features/welcome/welcome.component.ts`

Good first shell methods to route through the registry:

- open from home
- open recent item
- restore session

## Phase 5 — Split Shell State From SQLite Workspace State

Purpose: stop making `WorkspaceStore` the universal owner of all future providers.

### Current state

`WorkspaceStore` mixes at least three kinds of state:

- shell-ish state
  - loading
  - generic error
  - active tab
- SQLite workspace state
  - `.db` files
  - aliases
  - SQLite schemas
- SQLite browse/DDL behavior
  - select table
  - load rows
  - create/drop/alter schema objects

### Target state

Break this into clearer layers:

- shell workspace host state
  - active provider
  - provider-owned workspace presence
  - app-level loading/error boundaries where appropriate
- SQLite provider state/store
  - schemas
  - selected table
  - row browsing
  - DDL state

Checklist:

- identify which signals are shell-level vs SQLite-level
- create a host store or provider workspace host
- move SQLite-specific browse/DDL methods behind a SQLite provider store/service
- leave compatibility shims temporarily if needed to avoid a giant component rewrite

Files affected most:

- `src/app/core/store/workspace.store.ts`
- `src/app/layout/sidebar/*`
- browse/edit/query feature components that currently inject `WorkspaceStore`

Important warning:

- do not try to generalize all component inputs in one pass
- first move ownership boundaries, then simplify component APIs later

## Phase 6 — Rename DatabaseService To Its Real Role

Purpose: stop the current SQLite backend from presenting itself as if it were already a
generic backend abstraction.

### Current state

`DatabaseService` currently owns:

- SQLite file picker
- SQLite query execution
- SQLite row browsing
- SQLite DDL
- SQLite schema introspection

### Target state

The SQLite backend should be explicit, for example:

- `SqliteBackendAdapter`
- `SqliteDatabaseService`

And the shell/provider layer should decide when to use it.

Checklist:

- separate file picking from query execution if helpful
- rename the service to make SQLite ownership obvious
- keep the public methods intact at first if that reduces churn
- avoid creating a fake universal backend API too early

Files affected most:

- `src/app/core/services/database.service.ts`
- all SQLite-facing callers

Good intermediate step:

- keep the implementation mostly the same
- change the ownership semantics first

## Phase 7 — Introduce a SQLite Provider Boundary

Purpose: make the current shipped experience explicitly one provider among future peers.

Checklist:

- create `SqliteProviderDefinition`
- create or extract a SQLite workspace/store layer
- route recent item reopen through the SQLite provider
- route session restore through the SQLite provider
- route home/menu open actions through the SQLite provider

Success condition for this phase:

- the app still only supports SQLite functionally
- but the shell no longer assumes "database" means SQLite file everywhere

That is the real architectural milestone before MySQL begins.

## Phase 8 — Prepare the Home Screen for Multiple Open Actions

Purpose: make the shell visually consistent with the provider model before MySQL lands.

Checklist:

- replace the single "Open .db file" mental model with provider-aware launch actions
- keep SQLite as the only enabled action at first if necessary
- structure the UI so MySQL can be added without redesigning the welcome screen again
- keep recent items provider-aware

Files affected:

- `src/app/features/welcome/*`

This does not require full multi-provider UI yet. It just prevents another SQLite-only home
screen iteration.

## Phase 9 — Only Then Add MySQL

Purpose: start MySQL on a provider boundary that already exists.

Checklist:

- add MySQL connection profile storage
- add `MysqlProviderDefinition`
- add MySQL recent item shape
- add MySQL session payload
- add MySQL backend adapter
- add MySQL browse/query flows

This phase should not start until the SQLite path works through the provider shell.

## Testing Checklist By Phase

### Unit

- recent-item migration and provider discrimination
- session serialization/restoration discrimination by `providerId`
- provider registry lookup behavior
- SQLite provider restore/open adapter glue

### Integration

- restore saved SQLite session through provider-aware session path
- reopen recent SQLite item through provider-aware recent-items path
- SQLite browse/query/DDL behavior remains unchanged after provider extraction

### E2E

- welcome screen still opens SQLite file correctly
- recent item reopen still works
- session restore still works after relaunch

## Sequence Recommendation

Recommended implementation order:

1. shared provider data types
2. recent-items service migration
3. provider-aware session persistence
4. provider registry
5. SQLite backend/service rename and extraction
6. workspace host vs SQLite provider state split
7. SQLite provider definition wiring
8. home/menu provider-aware actions
9. MySQL implementation

This order keeps user-visible behavior stable while steadily reducing SQLite-global
assumptions.

## Stop Signs

Pause and reassess if implementation starts drifting into:

- designing Redis/Mongo contracts before SQLite provider extraction is complete
- inventing a giant universal backend interface
- rewriting all feature components before provider ownership is settled
- bolting MySQL directly onto `WorkspaceStore` or `DatabaseService`
- mixing secrets into recent items or generic session payloads

## Success Criteria

This checklist has done its job if the first implementation pass can answer:

- which file gets touched first
- what each current SQLite-global service should become
- how to sequence the refactor without breaking the app
- where to stop before MySQL feature work starts

## Related

- `provider-contract-plan.md`
- `multi-engine-architecture.md`
- `mysql-provider-plan.md`
- `status.md`
