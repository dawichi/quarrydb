# AGENTS.md

## Project Snapshot

Quarry is a local SQLite UI manager with a visual, composable query builder. The
differentiating feature is a step-by-step pipeline composer where each transformation shows
its intermediate result — inspired by functional array chaining (`.filter().map()`).

This file is the single source of truth for AI agents and contributors working on Quarry.
Read it first, then `docs/README.md` for coding conventions.

## Task Completion Requirements

- `bun run check` (Biome lint + format) and tests must pass before considering work done.
- New pure-logic features (SQL generation, data transforms, business rules) need unit tests.
  See `docs/status.md` for current testing coverage and where the gaps are.

## Package Roles

- `src/`: Angular 20 app — the desktop UI. Standalone components, Signals for state
  (`PipelineStore`, `WorkspaceStore`), `DatabaseService` as the `tauri-plugin-sql` bridge.
- `src-tauri/`: Tauri 2 shell — Rust backend, OS integration, native menus, auto-updater.
  No custom Rust commands; all DB access goes through `tauri-plugin-sql`.
- `landing/`: Astro site for quarrydb.app. Imports shared types so the interactive demo
  stays in sync with the real app's pipeline model.
- `packages/shared/`: Shared TypeScript types (`PipelineStep` and its variants) used by
  both the app and the landing page demo.

## Documentation Map

- `docs/architecture.md` — stack, repo layout, and the pipeline → CTE → SQL data flow
- `docs/product-spec.md` — what each feature does and why (pipeline interaction model,
  step types, JOIN modes, edit mode, saved queries, schema browser, etc.)
- `docs/status.md` — milestone log, implementation status, known issues, roadmap
- `docs/post-mvp-scoping.md` — Goals/Non-goals notes for post-MVP features, written before
  starting them (JOIN branch/subpipeline modes, SQLCipher)
- `docs/conventions/` — coding conventions (naming, structure, styling, TypeScript)

## Core Priorities

1. Transparency — the generated SQL is always visible; nothing happens "by magic."
2. Correctness over cleverness — this is a tool people trust with their data; edit mode
   is staged + transactional + rollback-on-failure for a reason.
3. Keep the app feeling fast and local-first — no telemetry, no network dependency for
   core functionality.

If a tradeoff is required between shipping something clever and keeping the data model and
generated SQL simple/predictable, choose the latter.

## Maintainability

If you add new functionality, first check whether shared logic belongs in
`packages/shared/`. Don't duplicate pipeline/CTE logic across the app and the landing demo.
