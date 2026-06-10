# Multi-Engine Architecture Plan

This document defines the architectural direction for evolving Quarry from a SQLite-first
desktop app into a broader database manager that can open different kinds of data systems
with provider-specific experiences.

It exists to prevent two failure modes:

1. Adding MySQL by hacking a second codepath into the current SQLite-only stores/services.
2. Over-correcting into a fake "one UI fits all databases" abstraction that makes SQLite,
   MySQL, Redis, Mongo, and future providers all feel equally generic and equally wrong.

The intended direction is neither of those. Quarry should become:

- one shared shell
- one shared visual identity
- one recent-items / home experience
- a provider registry underneath
- engine-specific workspaces on top

That means the product feels unified, while each database type still gets the right UI for
how that database actually works.

## Product Model

Think in terms of Quarry the app and provider modes inside it.

- Quarry
  - Home / recent items
  - Settings
  - Global layout chrome
  - Shared design system
  - Update flow
- Provider modes
  - SQLite mode
  - MySQL mode
  - Redis mode
  - Postgres mode
  - Mongo mode

The shell stays consistent. The active workspace experience changes based on what the user
opens.

## Core Principle

Do not flatten all databases into one universal feature model.

That sounds elegant at first, but it produces bad abstractions:

- Redis is not a table browser.
- Mongo is not a SQL schema explorer.
- SQLite local-file workspaces are not MySQL server connections.
- A relational query builder is not automatically meaningful for key/value or document
  stores.

So the correct abstraction target is provider capability boundaries, not a universal
"database screen."

## Shared Shell vs Provider-Owned UI

### Shared shell responsibilities

These should feel common across the whole app:

- Welcome / home screen
- Recent items list
- Saved connection/resource metadata
- App layout chrome
- Tabs, split panes, common modals, command surfaces
- Theme, typography, icons, motion, design tokens
- Settings, updater, release flow
- High-level workspace lifecycle: open, close, restore, forget recent item

### Provider-owned responsibilities

These should be allowed to differ substantially by database family:

- Connection/open flow
- Sidebar structure
- Resource tree semantics
- Querying model
- Editing model
- Schema/structure management tools
- Performance strategy for browsing data
- Advanced tooling specific to that engine

Examples:

- SQLite: local `.db` files, attached-file workspaces, table/view/trigger browser,
  relational pipeline builder, row editor, SQLite DDL tools.
- MySQL: server connection, schema/database hierarchy, MySQL SQL dialect, relational
  browsing/editing, connection/session concepts, potentially server-specific admin tools.
- Redis: keyspace browser, type-specific value viewers/editors, scan behavior, no default
  SQL pipeline builder.
- Mongo: database/collection browser, document editor, JSON-like query/filter and
  aggregation tooling.

## Provider Model

Each provider should register a small, explicit contract with the app shell.

At a minimum, a provider needs to define:

- identity
  - stable provider id (`sqlite`, `mysql`, `redis`, `mongo`, ...)
  - display name
  - icon
- recent-item metadata
  - how an opened resource is represented on the home screen
  - label, subtitle, provider icon, reconnect/open payload
- open/connect flow
  - file picker, connection form, credential prompt, etc.
- workspace bootstrap
  - what initial state is created when the resource opens
- navigation model
  - what appears in the sidebar and how it is grouped
- primary views
  - browse, query, edit, schema, server info, key inspector, document inspector, etc.
- capabilities
  - which shared features it supports
- backend adapter
  - the concrete data-access implementation for that provider

## Capability Model

Shared code should depend on capabilities, not on "all databases support the same things."

Examples of useful capability boundaries:

- `relationalSchemaBrowser`
- `sqlQueryRunner`
- `visualSqlPipeline`
- `rowEditor`
- `ddlManager`
- `serverConnection`
- `keyValueBrowser`
- `documentBrowser`

This lets Quarry reuse relational features where they genuinely fit:

- SQLite and MySQL can likely share large parts of a relational browsing/querying layer.
- Redis should not be forced through those same paths.
- Mongo may share some layout primitives, but not the relational query builder itself.

## Why MySQL Is the Right Second Provider

MySQL is the most practical second engine because it validates the provider architecture
without immediately jumping to a different data model.

It is different enough from SQLite to force the right refactors:

- file-open vs server connection
- attached-file workspace vs remote schema hierarchy
- SQLite dialect vs MySQL dialect
- `tauri-plugin-sql` assumptions vs a provider-owned backend adapter

But it still preserves a relational core:

- schemas/tables/views
- SQL query execution
- row-oriented browsing
- row editing
- DDL management

That makes MySQL the right bridge from "SQLite app" to "multi-provider app."

## Current SQLite-Coupled Assumptions That Must Be Isolated

Before MySQL implementation starts, these assumptions need to stop living in generic app
paths:

- "Open database" means "pick a local `.db` file"
- "Recent items" means "recent SQLite file paths"
- `WorkspaceStore` assumes a SQLite workspace model
- `DatabaseService` assumes `tauri-plugin-sql` + SQLite semantics
- Sidebar shape assumes tables/views/triggers from SQLite introspection
- Session restore assumes the current workspace shape
- Pipeline SQL generation assumes SQLite dialect and SQLite source-selection rules
- DDL tools assume SQLite-specific ALTER TABLE limitations and rebuild scripts
- Tutorial/sample flows assume a bundled SQLite database

Those are not bugs. They were correct for a SQLite-first product. They just need to become
provider-local instead of app-global.

## Proposed Layering

The intended architecture direction is:

1. App shell layer
   - provider registry
   - recent items service
   - workspace host
   - common layout/components
2. Shared capability layers
   - relational primitives reusable by SQLite/MySQL/Postgres later
   - common table/grid rendering
   - common query history / export patterns where applicable
3. Provider implementations
   - SQLite provider
   - MySQL provider
   - Redis provider
   - Mongo provider
4. Provider backend adapters
   - SQLite adapter
   - MySQL adapter
   - etc.

This is intentionally more modular than the current architecture, but not abstract for its
own sake. The rule is: only extract a shared layer when at least two providers actually
need it.

## First Refactor Slice Before Any MySQL Feature Work

The first implementation milestone should be architectural, not user-facing.

1. Introduce a provider identity into recent items and workspace/session state.
2. Split the current SQLite-specific open/recent/session logic out of generic shell paths.
3. Define a provider registry and provider contract in `packages/shared/` if shared types
   are needed across app and landing.
4. Make the home screen/provider launcher capable of opening different resource types.
5. Move the current SQLite experience behind an explicit SQLite provider boundary.

Only after that should MySQL-specific connection and workspace work begin.

## MySQL v1 Scope

The goal of MySQL v1 is not "parity with every SQLite feature on day one."

It is:

- save/open MySQL connections
- browse schemas, tables, and rows
- run SQL queries
- support a MySQL-aware relational query/pipeline experience if the existing pipeline can
  be adapted cleanly
- preserve Quarry's transparency and local-first UX

Likely non-goals for MySQL v1:

- deep server administration
- permissions/user management
- replication tooling
- migrations framework
- complete parity with every SQLite-specific DDL edge case

Those are now captured in `docs/mysql-provider-plan.md`.

## Deferred Work

The roadmap priority has changed:

- SQLCipher is intentionally deferred until real user demand exists.
- Code signing/notarization is intentionally deferred until the app has real traction.

Those are still valid future tasks. They are just not the next architectural frontier.

## Decision Summary

The correct near-term direction is:

- treat Quarry as a multi-provider database manager
- keep a shared shell
- build provider-specific workspaces
- extract real capability boundaries
- use MySQL as the second provider to validate the design
- defer SQLCipher and code signing until later

## Related

- `roadmap.md`
- `status.md`
- `architecture.md`
- `product-spec.md`
- `mysql-provider-plan.md`
