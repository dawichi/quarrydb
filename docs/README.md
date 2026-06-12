# Quarry — AI & Developer Reference

This folder contains the project context, architecture notes, product spec, status, and
coding conventions for Quarry. Any AI agent or contributor working on this codebase should
start at the repo-root [`AGENTS.md`](../AGENTS.md), then read the relevant file(s) here.

## Project Context

| File | What it covers |
|------|---------------|
| [architecture.md](architecture.md) | Stack, repo layout, the pipeline → CTE → SQL data flow, workspace model, release pipeline |
| [product-spec.md](product-spec.md) | What each feature does and why (pipeline interaction model, step types, JOIN modes, edit mode, saved queries, …) |
| [status.md](status.md) | Current implementation status, near-term roadmap, testing strategy, milestone log |
| [roadmap.md](roadmap.md) | Long-term vision and phased checkpoints for the SQLite-first → multi-engine transition |
| [multi-engine-architecture.md](multi-engine-architecture.md) | Provider model for evolving Quarry from a SQLite-first app into a broader database manager |
| [mysql-provider-plan.md](mysql-provider-plan.md) | Scope, UI model, connection model, and non-goals for MySQL as Quarry's second provider |
| [provider-contract-plan.md](provider-contract-plan.md) | Proposed TypeScript contracts for provider identity, recent items, workspace payloads, capabilities, and backend adapters |
| [provider-refactor-checklist.md](provider-refactor-checklist.md) | File-by-file implementation checklist for moving the app from SQLite-global state to a provider-based shell |
| [local-test-services.md](local-test-services.md) | Optional Docker-based local MySQL/Postgres/Redis setup for manual provider testing during development |
| [schema-management-plan.md](schema-management-plan.md) | Historical build-order plan for SQLite DDL support (create/alter/drop tables, columns, indexes, views, triggers) |
| [post-mvp-scoping.md](post-mvp-scoping.md) | Goals/Non-goals notes for post-MVP features, written before starting them |

## Convention Files

| File | What it covers |
|------|---------------|
| [conventions/angular-standalone.md](conventions/angular-standalone.md) | Standalone components, new control flow syntax, Signals, inject() |
| [conventions/component-naming.md](conventions/component-naming.md) | File naming, selector naming, directory structure |
| [conventions/component-structure.md](conventions/component-structure.md) | Section separators, visibility modifiers, component size |
| [conventions/typescript-strict.md](conventions/typescript-strict.md) | No `any`, explicit types, type imports |
| [conventions/styling.md](conventions/styling.md) | Tailwind-first, when SCSS is allowed |
| [conventions/shared-package-structure.md](conventions/shared-package-structure.md) | No-barrel-index rule for `packages/shared` — domain files get their own subpath exports |

## Quick Rules

- All components are standalone — no NgModules
- Angular Signals for state — no NgRx
- `inject()` syntax — no constructor injection
- Tailwind CSS for all styling — SCSS only for keyframes/animations
- Biome for linting and formatting (`bun run check`)
- No `any` types without a TODO comment
