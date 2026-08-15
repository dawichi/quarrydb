# Automated Testing

Quarry's local QA loop is split into fast logic tests and browser tests:

```bash
bun run check       # Biome lint + formatting check
bun run test:run    # Vitest unit and SQLite integration tests
bun run test:e2e    # Playwright browser tests against Angular
bun run test:mysql  # Real MySQL provider integration tests via Docker
bun run build       # Production Angular bundle
bun run build:landing # Production Astro landing bundle
```

Run the complete local verification sequence with:

```bash
bun run qa
```

For the full local loop, including Docker-backed MySQL:

```bash
bun run qa
bun run test:mysql
```

The Playwright configuration starts the Angular dev server automatically and uses a fresh
Chromium context for each test. It covers the welcome/provider flow and a deterministic
SQLite golden path: session restore, table browsing, query-tab navigation, WHERE-step
creation, generated SQL, result rendering, staged row updates, apply, and CSV export. The
SQLite browser fixture mocks only the Tauri IPC boundary, while real adapter behavior is
tested separately against MySQL and SQLite integration fixtures.
The Tauri native shell is deliberately not required for these tests, so native dialogs and
menu registration do not block browser QA.

Install the browser once on a new machine:

```bash
bunx playwright install chromium
```

GitHub Actions runs the same checks on pushes to `main` and pull requests. The MySQL
integration suite starts the disposable MySQL 8 container, exercises the real provider
adapter through a `mysql2` test transport, and stops the container afterward. It covers
schema discovery, metadata, sample seeding, paging, type normalization, raw expressions,
and joined query previews.

## Native shell boundary

Playwright covers the webview and the Tauri IPC boundary, but it does not drive OS-native
macOS/Windows dialogs or menu bars. Those require a native WebDriver stack such as
`tauri-driver` plus an installed platform driver, or a small manual smoke check on each
target OS. The browser tests still verify that export and database operations issue the
expected IPC calls, which keeps most regressions out of that final platform-specific layer.
