# Quarry — AI & Developer Reference

This folder contains the project context, architecture notes, product spec, status, and
coding conventions for Quarry. Any AI agent or contributor working on this codebase should
start at the repo-root [`AGENTS.md`](../AGENTS.md), then read the relevant file(s) here.

## Project Context

| File | What it covers |
|------|---------------|
| [architecture.md](architecture.md) | Stack, repo layout, the pipeline → CTE → SQL data flow, workspace model, release pipeline |
| [product-spec.md](product-spec.md) | What each feature does and why (pipeline interaction model, step types, JOIN modes, edit mode, saved queries, …) |
| [status.md](status.md) | Current implementation status, roadmap, testing strategy, milestone log |

## Convention Files

| File | What it covers |
|------|---------------|
| [conventions/angular-standalone.md](conventions/angular-standalone.md) | Standalone components, new control flow syntax, Signals, inject() |
| [conventions/component-naming.md](conventions/component-naming.md) | File naming, selector naming, directory structure |
| [conventions/component-structure.md](conventions/component-structure.md) | Section separators, visibility modifiers, component size |
| [conventions/typescript-strict.md](conventions/typescript-strict.md) | No `any`, explicit types, type imports |
| [conventions/styling.md](conventions/styling.md) | Tailwind-first, when SCSS is allowed |

## Quick Rules

- All components are standalone — no NgModules
- Angular Signals for state — no NgRx
- `inject()` syntax — no constructor injection
- Tailwind CSS for all styling — SCSS only for keyframes/animations
- Biome for linting and formatting (`bun run check`)
- No `any` types without a TODO comment
