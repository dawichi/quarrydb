# Automated Testing

Quarry's local QA loop is split into fast logic tests and browser tests:

```bash
bun run check       # Biome lint + formatting check
bun run check:docs  # Verify maintained relative Markdown links
bun run test:run    # Vitest unit and SQLite integration tests
bun run test:e2e    # Playwright browser tests against Angular
bun run test:landing # Playwright smoke tests against the Astro landing site
bun run test:mysql  # Real MySQL provider integration tests via Docker
bun run test:redis  # Redis provider integration tests when Docker is available
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

The landing Playwright configuration builds the Astro site, starts its preview server, and
uses a fresh Chromium context for each test. It covers the public page contract, release-link
fallback when GitHub is unavailable, and the interactive demo's pipeline/SQL/result updates.
The GitHub release API is stubbed in these tests so landing QA remains deterministic and does
not consume a network-dependent rate limit.

Install the browser once on a new machine:

```bash
bunx playwright install chromium
```

GitHub Actions runs the same checks on pushes to `main` and pull requests. The MySQL and Redis
integration suites start disposable containers, exercise the real provider boundaries, and stop
them afterward. MySQL uses a `mysql2` test transport and covers
schema discovery, metadata, sample seeding, paging, type normalization, server-side browse
filtering/sorting, raw expressions, and joined query previews. Redis exercises the native Rust
command against a live local server, including bounded previews for string, list, set, sorted-set,
hash, and stream values.

Redis native command tests run at the Rust unit boundary in every local run. CI also provisions
Redis and runs the live protocol test. On a developer machine, `bun run test:redis` provisions the
same fixture; when Docker is unavailable, it reports that fact without pretending the remote
protocol was tested.

## Native shell boundary

Playwright covers the webview and the Tauri IPC boundary, but it does not drive OS-native
macOS/Windows dialogs or menu bars. Those require a native WebDriver stack such as
`tauri-driver` plus an installed platform driver, or a small manual smoke check on each
target OS. The browser tests still verify that export and database operations issue the
expected IPC calls, which keeps most regressions out of that final platform-specific layer.
