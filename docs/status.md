# Status

Quick reference for where the project stands. Update this after each significant milestone.

## Current Status

**Pipeline builder MVP is feature-complete.** All six step types are implemented; undo/redo
and step drag-reorder are done. v0.1.x has shipped publicly with auto-updates working.

## Implementation Status

| Feature | Status |
|---------|--------|
| Monorepo scaffold (Tauri 2 + Angular 20 + Astro + shared) | ✅ Done |
| App shell (sidebar, workspace store, database service, welcome) | ✅ Done |
| Table viewer (row browsing, sticky headers, load more) | ✅ Done |
| Pipeline builder — app frame (tabs, step cards, SQL panel) | ✅ Done |
| Pipeline step: WHERE | ✅ Done |
| Pipeline step: SELECT (with column drag-reorder) | ✅ Done |
| Pipeline step: ORDER BY + LIMIT | ✅ Done |
| Pipeline step: GROUP BY + aggregations | ✅ Done |
| Pipeline step: JOIN (inline table picker) | ✅ Done |
| Pipeline step: RAW SQL | ✅ Done |
| Undo/redo (Ctrl/Cmd+Z) | ✅ Done |
| Pipeline step drag-reorder | ✅ Done |
| Error propagation visual badge on blocked step headers | ✅ Done |
| Table viewer cell interactions (copy cell, copy row as JSON, click header → sort) | ✅ Done |
| Edit mode (staged edits, diff panel, atomic transaction) | ✅ Done |
| FK reference navigation in Browse (breadcrumb trail, → chip on FK cells) | ✅ Done |
| Saved queries (named, with `:variable` placeholders + auto-form) | ✅ Done |
| Session persistence (restore open pipelines on relaunch) | ✅ Done |
| Export (CSV, JSON, SQL INSERT, Markdown table) | ✅ Done |
| First launch experience + interactive tutorial | ✅ Done |
| Native macOS menu bar (File, Edit, Window) | ✅ Done |
| Windows menu bar | ⏳ Pending review (only OS-variable feature; needs testing on Windows) |
| Landing page (quarrydb.app — Astro, deployed and live) | ✅ Done |
| GitHub Releases + tauri-plugin-updater auto-update pipeline | ✅ Done |
| Logo: Quarry Pit (app icon + landing + favicon) | ✅ Done |
| Testing — Vitest unit tests for CTE builder (34 tests) | ✅ Done |
| Testing — Vitest unit tests for updater service (18 tests) | ✅ Done |
| Testing — integration tests for pipeline run/export and edit-mode transactions (8 tests) | ✅ Done |
| Query history (opt-in) | ✅ Done |
| Testing — Vitest unit tests for query history service (15 tests) | ✅ Done |
| Testing — Playwright E2E | ⬜ Post-MVP |
| JOIN: branch input mode | ⬜ Post-MVP |
| JOIN: subpipeline mode | ⬜ Post-MVP |
| Encrypted SQLite (SQLCipher) | ⬜ Post-MVP |
| Schema management (DDL): tables, columns, indexes, views, triggers | ✅ Done |

## Roadmap / Planned Next Steps

See `docs/roadmap.md` for the long-term phased view (SQLite-complete → production polish →
multi-engine expansion). This list is the near-term, concrete slice of that.

1. **Windows menu bar** — verify once a contributor tests on Windows.
3. **JOIN: branch input & subpipeline modes** — see `docs/product-spec.md#join-modes` for
   the build-order rationale, and `docs/post-mvp-scoping.md` for Goals/Non-goals before
   starting either one.
4. **Encrypted SQLite (SQLCipher)** — `rusqlite` can be swapped for a SQLCipher-enabled
   build without architectural changes; deferred until users actually request it. See
   `docs/post-mvp-scoping.md` for Goals/Non-goals.
5. **Code signing** — Apple notarization + Windows EV certificate, see
   `docs/architecture.md#known-platform-issues`. Deliberately deferred — the project has
   no users yet, the workaround is trivial, and the source being public/open already
   signals legitimacy to the early-adopter audience that would install it first. Revisit
   if it gains real organic traction (e.g. >20 users).

## Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | CTE query builder (input: step array → output: SQL string, pure-function coverage) and the updater service (mocked Tauri plugin APIs — polling, manual checks, skip persistence, install narration, error paths). |
| Integration | Vitest + `node:sqlite` fake | Real SQLite-backed fixture standing in for `tauri-plugin-sql` (see `src/app/core/integration/fixtures/`) — runs generated pipeline SQL and `applyEdits` transactions against real SQLite, asserting on real rows, real constraint failures, and real rollback behavior. Covers: pipeline run → export, and edit mode → apply → rollback-on-constraint-failure (UNIQUE + FK). |
| E2E | Playwright | Full GUI flows: open file, build pipeline, edit row, export. |

AI-assisted development makes solid test coverage critical — tests are the safety net
against unintentional regressions.

**Cadence:** after completing each major feature or section, pause and evaluate whether any
of the three layers applies before moving on. Don't let coverage debt accumulate across
multiple features.

- **Unit** → whenever a feature introduces pure logic (SQL generation, data transformation,
  business rules)
- **Integration** → once a full user-facing flow is stable end-to-end (e.g. edit mode, export)
- **E2E** → once the app is feature-complete enough that golden-path flows are stable

## Milestone Log

| Date | Milestone |
|------|-----------|
| 2026-06-04 | Monorepo scaffolded: Tauri 2 + Angular 20 + Astro landing + packages/shared |
| 2026-06-04 | App shell: WorkspaceStore (Signals), DatabaseService, sidebar schema browser, welcome screen |
| 2026-06-04 | Table viewer: click table → browse rows, sticky column headers, Load more pagination (100 rows/page) |
| 2026-06-05 | Pipeline builder (4a+4b): Browse/Query tabs, WHERE step with debounced live CTE execution, column chips, inline results per step, generated SQL panel with copy |
| 2026-06-06 | Pipeline steps: SELECT (col reorder drag), ORDER BY + LIMIT, GROUP BY + aggregations, JOIN (inline picker), RAW SQL |
| 2026-06-06 | Undo/redo (Ctrl/Cmd+Z), pipeline step drag-reorder (mouse-event based, WKWebView-compatible) |
| 2026-06-06 | Error propagation: blocked step badge, logic fix, visual polish (opacity + pointer-events-none) |
| 2026-06-06 | Vitest unit tests (34) for CTE builder; README rewritten with project structure + run/test docs |
| 2026-06-06 | Table viewer: copy cell, copy row as JSON, column header sort (server-side, cycle ASC→DESC→off) |
| 2026-06-06 | Export: CSV, JSON, SQL INSERT, Markdown — from Browse tab and Query tab, full uncapped fetch |
| 2026-06-06 | Sample db download flow: save dialog → generate at chosen path → open via normal workspace flow |
| 2026-06-06 | Edit mode (3rd tab): staged UPDATE/DELETE/INSERT, diff panel, atomic transaction with rollback |
| 2026-06-06 | FK reference navigation: breadcrumb trail, → chip on FK cells, redirect-style navigation with filter |
| 2026-06-06 | Session persistence: localStorage autosave (debounced 500ms), restore on relaunch (workspace + table + pipeline steps) |
| 2026-06-06 | Saved queries: named queries persisted to localStorage per table, :variable placeholder detection + amber input bar, save/load/delete from SQL panel |
| 2026-06-07 | First launch experience: recent files list in welcome screen, interactive tutorial (4-step, auto-advancing overlay using sample e-commerce db) |
| 2026-06-07 | Native macOS menu bar: Quarry/File/Edit/Window menus, Hard Reset in File menu clears all localStorage + reloads |
| 2026-06-07 | Windows menu bar: pending review — only OS-variable feature |
| 2026-06-07 | Lint pass: 0 Biome errors, 34/34 Vitest tests passing |
| 2026-06-07 | Landing page: Astro + Tailwind v4, interactive pipeline demo (fake e-commerce data), features grid, stack section, dummy download buttons |
| 2026-06-07 | Auto-updates: tauri-plugin-updater + tauri-plugin-process wired up, pubkey in tauri.conf.json, in-app update banner, GitHub Actions release workflow on v* tags |
| 2026-06-07 | v0.1.0 released — first public GitHub Release (all 3 platforms) |
| 2026-06-07 | Logo: Quarry Pit (concentric square rings, sky blue, dark navy bg) — app icons all sizes (.icns, .ico, Windows APPX), landing page hero + nav, favicon |
| 2026-06-07 | Auto-update pipeline fix (v0.1.2): root cause was tauri-action repacking the signed .tar.gz before reading its sig — fixed by bypassing tauri-action's latest.json generation and assembling it in a dedicated `finalize` job after all builds |
| 2026-06-07 | Integration tests (8): `node:sqlite`-backed fake standing in for `tauri-plugin-sql`, covering pipeline run → export and edit-mode apply/rollback (UNIQUE + FK) |
| 2026-06-07 | `docs/post-mvp-scoping.md`: Goals/Non-goals notes for JOIN branch mode, JOIN subpipeline mode, and SQLCipher — written before starting any of them |
| 2026-06-07 | Differential-update spike: investigated binary-diff updates for the auto-updater — declined (bundles already small ~6MB, no upstream Tauri support, custom patch-and-replace of signed binaries is high-risk for likely-modest savings); see `docs/architecture.md#release-pipeline--auto-updates` |
| 2026-06-07 | `docs/conventions/shared-package-structure.md`: no-barrel-index convention for `packages/shared`, written before the package grows enough to need splitting |
| 2026-06-08 | Auto-update relaunch fix (v0.1.7): found and fixed a missing `process:allow-restart` capability that silently blocked relaunch after install — the update landed on disk but never relaunched into it; replaced the silent install spinner with a narrated modal flow (downloading → downloaded → restarting); added `scripts/local-update-test.ts` to exercise the real detect → download → verify → install → relaunch chain end-to-end on localhost with a dedicated test-only signing keypair; rotated the production updater signing keypair (previous private key was lost/unrecoverable) |
| 2026-06-08 | Update prompts: added Skip/Later actions to the banner and modal, release-date display, and link-out to the GitHub release page (instead of rendering notes inline); skipped versions persist to `localStorage` so the silent poller stops surfacing them, while a manual "Check for Updates…" still reports the truth — `updater.service.spec.ts` now covers all of it (18 tests) |
| 2026-06-08 | Query history (opt-in, off by default): logs each executed query with its SQL, source, duration, and row count once the pipeline "settles" (3s of no further edits) and dedupes consecutive repeats for the same source — keeps the live-execution-on-every-keystroke model from spamming the log; entries snapshot the pipeline `steps` so they can be reloaded straight back into the visual builder; `query-history.service.spec.ts` covers enable/persist, log/dedupe/cap, search, and clear (15 tests) |
| 2026-06-09 | DDL checkpoint 2: visual Create Table builder — column list (name, type, nullability, PK flag, FK reference), inline FK column picker, duplicate-name warning, generated `CREATE TABLE` SQL preview, two-step drop confirmation (type name to confirm) |
| 2026-06-09 | DDL checkpoint 3: index management — create (`CREATE [UNIQUE] INDEX` with column picker) and drop indexes from the table settings modal; confirmation view shows index columns and UNIQUE constraint before executing `DROP INDEX` |
| 2026-06-09 | DDL checkpoint 4: ALTER TABLE — add column (name, type, NOT NULL, optional DEFAULT), rename column, rename table; SQL preview panel on each operation; `WorkspaceStore` gains `alterAddColumn` / `alterRenameColumn` / `alterRenameTable` with `reselectIfOpen` so the open table refreshes in place; unit tests in `alter-table.utils.spec.ts` (9 tests) |
| 2026-06-09 | DDL checkpoint 6: views & triggers — create, edit, drop; `ViewModal` and `TriggerModal` follow the same preview-before-execute pattern; edit wraps DROP + CREATE in `BEGIN/COMMIT` via `runDdlScript`; sidebar gains "+" buttons on Views/Triggers section headers and a pencil-on-hover edit button for each existing object |
| 2026-06-09 | DDL checkpoint 5 (partial): drop column via rebuild dance — SQLite rebuild script (PRAGMA fk OFF → BEGIN → CREATE new → INSERT SELECT → DROP old → RENAME → recreate indexes → COMMIT → PRAGMA fk ON), drop button on hover for non-PK columns (hidden when only one column remains), type-the-column-name confirmation; `DatabaseService.runDdlScript()` runs the sequence and rolls back on failure; unit tests (7) for script structure / FK pruning / index survival; integration tests (4) for data preservation, index recreation, and rollback |
