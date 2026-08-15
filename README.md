<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Quarry logo" width="96" />
</p>

<h1 align="center">Quarry</h1>

<p align="center">
  A local-first database UI manager for SQLite, MySQL, and Redis with a visual, composable query builder.<br/>
  Each pipeline step shows its intermediate result — like <code>.filter().map()</code>, but for SQL.
</p>

---

## What it does

Quarry lets you open local `.db` files, connect to MySQL servers, or browse Redis/Valkey keyspaces. SQLite and MySQL support a visual pipeline where every step shows a live preview; Redis has a type-aware key browser and command runner. Generated SQL is always visible and copyable.

Target audience: developers who work with SQLite data and want something faster than writing raw SQL from scratch, but more transparent than a GUI that hides what it's doing.

---

## Repository layout

```
quarrydb/
├── src/               # Angular 20 app — the desktop UI
├── src-tauri/         # Tauri 2 shell — Rust backend, OS integration, SQLite bridge
├── landing/           # Astro landing site (quarrydb.app)
└── packages/
    └── shared/        # Shared TypeScript types (used by app + landing demo)
```

### `src/` — Angular app

The desktop frontend. Built with Angular 20 Signals, styled with Tailwind CSS v4. Key areas:

- `src/app/core/store/` — provider-owned stores plus shared host state (all state as Signals)
- `src/app/core/services/` — provider adapters, persistence, export, and updater services
- `src/app/features/pipeline-builder/` — the visual query builder and step cards
- `src/app/features/table-viewer/` — table row browser with pagination

### `src-tauri/` — Tauri shell

Rust backend. Handles the native window, menus, file dialogs, OS keyring integration, export file writes, the `tauri-plugin-sql` bridge, and the Redis/Valkey socket boundary.

### `landing/` — Astro site

Marketing and portfolio landing page for quarrydb.app. Imports types from `packages/shared` so the interactive demo stays in sync with the real app's pipeline model.

### `packages/shared/` — shared types

TypeScript type definitions shared between the Angular app and the Astro landing. `PipelineStep` and its variants (`WhereStep`, `SelectStep`, `JoinStep`, etc.) live here.

---

## Running the app

**Prerequisites:** Rust toolchain, Bun, and the [Tauri v2 prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
# Install dependencies
bun install

# Dev mode (Tauri window + Angular + Tailwind all watching)
bun run tauri dev

# Production build
bun run tauri build
```

The Angular dev server alone (no native window, useful for UI work):

```bash
bun run start
```

Optional local server databases for manual provider testing:

```bash
bun run dev:services:up
```

This starts disposable local MySQL, Postgres, and Redis containers via
[`docker-compose.local-test-services.yml`](docker-compose.local-test-services.yml). Full
connection details, MySQL sample-data steps, and teardown commands are in
[`docs/local-test-services.md`](docs/local-test-services.md).

---

## Running the tests

Unit tests cover SQL generation, provider stores and adapters, persistence, updater behavior, edit-mode transactions, and database integration fixtures.

```bash
# Run once (CI mode)
bun run test:run

# Browser UI tests (installs Chromium once with `bunx playwright install chromium`)
bun run test:e2e

# Watch mode
bun run test
```

Tests live alongside the code they cover, with browser workflows under `e2e/` and controlled database fixtures under `src/app/core/integration/`.

---

## Linting and formatting

```bash
bun run check      # Biome: lint + format (auto-fix)
bun run check:ci   # Biome: non-mutating CI check
bun run lint       # Biome: lint only
bun run format     # Biome: format only
```

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Shell | Tauri 2.0 |
| Frontend | Angular 20 + TypeScript + Signals |
| Styling | Tailwind CSS v4 |
| State | Angular Signals (no NgRx) |
| SQLite bridge | tauri-plugin-sql |
| Package manager | Bun |
| Linter / Formatter | Biome |
| Unit tests | Vitest |
| E2E tests | Playwright |
| Landing | Astro |

---

## License

MIT
