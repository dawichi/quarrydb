# Testing

```bash
bun run check        # Biome lint + format (auto-fix); check:ci is the non-mutating version
bun run check:docs   # Relative Markdown links resolve
bun run test:run     # Vitest: compiler, stores, adapters, SQLite integration
bun run test:e2e     # Playwright against the Angular app with a faked Tauri IPC layer
bun run test:landing # Playwright smoke tests for the Astro site
bun run test:mysql   # Starts MySQL in Docker; runs the Vitest and Rust MySQL suites
bun run test:redis   # Starts Redis in Docker; runs the live Redis suite
bun run qa           # Everything above except the Docker suites, plus both builds
(cd src-tauri && cargo test && cargo clippy --all-targets && cargo fmt --check)
```

CI (`.github/workflows/ci.yml`) runs all of it, including the live MySQL and Redis suites.
The release workflow reuses CI, so a tag cannot ship what `main` would not.

## What each layer proves

| Layer | Where | Proves |
|-------|-------|--------|
| Compiler | `packages/shared/src/pipeline-sql.spec.ts` | Generated SQL **runs** on real SQLite and returns the right rows (JOIN projection, naming, variables, ordering) |
| Store | `src/app/core/store/pipeline.store.spec.ts` | Step execution, error blocking, restore, undo/redo against an in-memory SQLite backend |
| Services | `src/app/core/integration/*.spec.ts` | SQLite services run real SQL through a fake native client backed by `node:sqlite` |
| MySQL | `mysql-provider.integration.spec.ts` | Adapter SQL against a live server: metadata, paging, numeric sorting, pipelines, transactional edits |
| Native | `src-tauri/src/sql/mod.rs` | Value decoding (SQLite and live MySQL), rollback on stale edit targets |
| IPC | `src-tauri/src/lib.rs` (`ipc_tests`) | The JSON the frontend sends matches the Rust command signatures |
| Browser | `e2e/` | Golden paths through the UI with the Tauri IPC layer faked |
| Smoke | `e2e/smoke.native.spec.ts` | The release checklist through the real UI **and** the real Rust commands, via a local bridge |

## Rule

A feature is not done until a test that would fail without it passes. Do not record anything as
verified in docs or release notes unless a test run proved it.

## Native smoke test

`e2e/smoke.native.spec.ts` drives the UI in Chromium, but every app command goes to the real
Rust code through the `ui_bridge` test, which serves them on `127.0.0.1:1430`. It covers the
SQLite sample pipeline, edits, CSV export, MySQL, Redis, diagnostics and session restore. It is
skipped unless `QUARRY_BRIDGE` is set:

```bash
bun run dev:services:up
cargo test --manifest-path src-tauri/Cargo.toml --lib ui_bridge -- --ignored   # leave running
QUARRY_BRIDGE=1 bunx playwright test e2e/smoke.native.spec.ts
```

Screenshots and exported files land in `/tmp/quarry-smoke/<timestamp>/`.

## Not covered automatically

Native menus, OS dialogs, the keyring, installers and the updater run only in a real install;
see the smoke test in [release.md](release.md).
