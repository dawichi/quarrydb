# Architecture

## Stack

| Layer | Choice |
|-------|--------|
| Shell | Tauri 2.12 (Rust) |
| Frontend | Angular 22 + TypeScript + Signals |
| Styling | Tailwind CSS v4 (SCSS only for animations/keyframes) |
| SQL access | Native `sqlx` layer in Rust (SQLite and MySQL), see `src-tauri/src/sql` |
| Redis/Valkey | Native `redis` crate behind typed Tauri commands, see `src-tauri/src/redis.rs` |
| Auto-updates | `tauri-plugin-updater` (GitHub Releases) |
| Package manager | Bun |
| Linter / Formatter | Biome (`bun run check`), rustfmt + clippy |
| Testing | Vitest, Playwright, `cargo test` (incl. live MySQL/Redis in CI) |
| Landing | Astro |

## Repository layout

```
quarrydb/
├── src/app/
│   ├── core/native/       # sql-client.ts: the only TypeScript door to native SQL
│   ├── core/providers/    # SQLite / MySQL / Redis adapters, pipeline backends
│   ├── core/store/        # Signal stores; pipeline.store.ts is engine-agnostic
│   ├── features/          # pipeline-builder, table-viewer, edit-mode, workspaces, …
│   └── layout/            # app shell (sidebar / schema browser)
├── src-tauri/src/
│   ├── sql/               # pools, value decoding, bound params, transactions
│   ├── redis.rs           # Redis/Valkey commands
│   ├── secrets.rs         # OS keyring
│   ├── menu.rs, files.rs  # native menu, export writes
│   └── lib.rs             # wiring only
├── packages/shared/       # pipeline model + compiler (pipeline-sql.ts), shared types
└── landing/               # Astro site (quarrydb.app)
```

## The pipeline (the core of the product)

A pipeline is a source table followed by steps (WHERE, SELECT, ORDER BY, GROUP BY, JOIN, raw
SQL). Each step shows the rows it produces, so a query reads like `.filter().map()`.

`packages/shared/src/pipeline-sql.ts` compiles a pipeline into one CTE per step:

```sql
WITH step_1 AS (SELECT * FROM "orders"),
     step_2 AS (SELECT * FROM step_1 AS "orders" WHERE total > ?),
     step_3 AS (SELECT "orders".*, "customers"."id" AS "customers_id", "customers"."name" AS "name"
                FROM step_2 AS "orders" INNER JOIN "customers" AS "customers"
                ON orders.customer_id = customers.id)
SELECT * FROM step_3
```

Rules the compiler guarantees (each one is tested by running real SQL):

- **Stable naming.** Every step reads the previous result under the source table's own name
  (`orders`), so expressions mean the same thing at any position and survive reordering.
  CTE names are an implementation detail users never type. Pipelines saved before 0.2 that
  referenced `step_N` in a JOIN condition still compile.
- **Column tracking.** The compiler knows the columns flowing out of every step (from the
  schema, SELECT aliases, GROUP BY keys and aggregates). The UI offers exactly those columns.
  A raw SQL step makes them unknown until it runs.
- **Explicit JOIN projection.** Joined columns keep their names unless the left side already
  has them; then they become `<alias>_<column>`. Results never contain duplicate names.
- **Bound variables.** `:name` placeholders become parameters. String literals, quoted
  identifiers and comments are skipped. Numeric-looking values bind as numbers.
- **Ordering survives.** The last effective ORDER BY is re-applied to the final query, because
  databases (MySQL in particular) may ignore ordering inside derived tables.
- **Compile errors stay on the step.** An unset variable, unknown table, MySQL `FULL JOIN` or an
  unaliased self-join is reported on that step; later steps show as blocked.

`PipelineStore` runs each step's preview (`LIMIT 50`) and `COUNT(*)` through a
`PipelineBackend` (`core/store/pipeline-backend.ts`). SQLite and MySQL each supply one
(`core/providers/pipeline-backends.ts`), so both workspaces render the same
`<app-pipeline-builder>`. A newer run supersedes an older one; stale results are discarded.

## Native SQL layer

The webview never builds connection strings or talks to a database driver. It calls four
commands (`src/app/core/native/sql-client.ts` ↔ `src-tauri/src/sql/mod.rs`):

| Command | Purpose |
|---------|---------|
| `sql_connect(target)` | Open or reuse a pool; returns a secret-free handle (`sqlite:<path>`, `mysql:<id>`) |
| `sql_select(handle, sql, params, maxRows)` | Rows as arrays + column names; stops reading at `maxRows` |
| `sql_execute(handle, statements, transactional, onError)` | Ordered statements on **one** connection |
| `sql_disconnect(handle)` | Close the pool |

- Values are decoded by engine type: integers and floats as numbers, MySQL `DECIMAL` as a number
  when that is exact (string otherwise), dates as ISO-like strings, `JSON` as JSON, binary data
  as UTF-8 text or a `{ encoding: "base64", data }` envelope.
- Staged edits run as one transaction. Statements marked `expectRows` fail the batch when they
  touch nothing (a row changed underneath you), and the whole batch rolls back.
- DDL scripts that manage their own transaction run non-transactionally on one connection, with
  `onError` cleanup (`ROLLBACK`, `PRAGMA foreign_keys = ON`) before the connection is reused.
- Every statement has a 60 s timeout; MySQL sessions also set `max_execution_time`.
- Rust and TypeScript agree on argument names through an IPC test (`lib.rs`, `ipc_tests`).

## Providers

- **SQLite** — a workspace of one or more `.db` files. Each file is its own pipeline backend;
  joins happen within one file (Quarry does not `ATTACH` databases).
- **MySQL** — saved connection profiles, passwords optionally in the OS keyring. One pipeline
  backend per connection; tables are addressed as `schema.table`.
- **Redis/Valkey** — key browser and command runner. Redis is deliberately not forced through
  the relational pipeline. Commands run off the main thread with bounded previews.

## Native capability boundary

The main window's capability allowlist (`src-tauri/capabilities/default.json`) grants only the
open/save dialogs, URL opener, updater check/install and restart. Custom commands (SQL, Redis,
keyring, export) are registered explicitly in `lib.rs`. Any new command needs a boundary test.

## Release pipeline and auto-updates

Distribution is via GitHub Releases, consumed in-app by `tauri-plugin-updater`. Users see an
in-app banner when an update is available; installing is always a manual two-click action.

**Build pipeline:** pushing a `v*` tag runs the full CI suite (`release.yml` reuses `ci.yml`),
then a matrix build (macOS arm64, macOS x64, Windows) via `tauri-action`.

**The manifest-assembly problem:** `tauri-action` repacks the signed `.tar.gz` artifact
*before* reading its signature, which breaks the signature in the `latest.json` it generates.
A dedicated `finalize` job assembles `latest.json` itself from the already-signed
`.tar.gz.sig` / `.exe.sig` files after all matrix builds complete. If you touch the release
workflow: **assemble the final update manifest yourself, after signing, in a dedicated step.**

**Testing the update flow locally:** `scripts/local-update-test.ts` runs the real chain
(detect, download, verify, install, relaunch) on localhost with a test-only keypair and
distinct app identifiers:

1. `bun scripts/local-update-test.ts baseline <low version>` builds an installable "old" app.
2. Install and launch it.
3. `bun scripts/local-update-test.ts release <higher version>` builds, signs and serves a newer
   version on `localhost:17420`.
4. In the baseline app, "Check for Updates…" and watch it update and relaunch.

Differential updates were investigated and declined (2026-06-07): bundles are ~4–6 MB and Tauri
has no binary-diff support (`tauri-apps/tauri#11863`).

## Known platform issues

**macOS "app is damaged":** builds are not notarized. After dragging to `/Applications`:
`xattr -cr /Applications/Quarry.app`. The release workflow supports notarization once
`APPLE_CERTIFICATE` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` secrets exist.

**Windows SmartScreen:** unsigned installer; "More info" → "Run anyway".
