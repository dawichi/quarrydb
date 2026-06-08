# Architecture

## Stack

| Layer | Choice |
|-------|--------|
| Shell | Tauri 2.0 |
| Frontend | Angular 20 + TypeScript + Signals |
| Styling | Tailwind CSS v4 (SCSS only for animations/keyframes) |
| State | Angular Signals (no NgRx) |
| SQLite bridge | `tauri-plugin-sql` |
| Auto-updates | `tauri-plugin-updater` (GitHub Releases) |
| Package manager | Bun |
| Linter / Formatter | Biome (`bun run check`) |
| Testing | Vitest (unit) + Playwright (E2E, planned) |
| Landing | Astro |

## Repository Layout (Monorepo)

```
quarrydb/
├── src/                  # Angular app — the desktop UI
│   └── app/
│       ├── core/         # services (DatabaseService, …) + state stores (WorkspaceStore, PipelineStore)
│       ├── layout/       # app shell (sidebar / schema browser)
│       ├── features/     # table-viewer, pipeline-builder, edit-mode, tutorial,
│       │                 # welcome, update-check-modal, update-banner
│       └── shared/       # cross-feature directives
├── src-tauri/            # Rust shell (Tauri standard location)
│                         # No custom Rust commands — all DB access goes through tauri-plugin-sql
├── landing/              # Astro site for quarrydb.app
└── packages/
    └── shared/           # Shared TypeScript types (PipelineStep & variants),
                          # imported by both the app and the landing page's interactive demo
```

## Data Flow: Pipeline → CTE Chain → SQL

The pipeline builder is the core of the app. Each step the user adds is a transformation on
the result set, and the whole pipeline compiles down to a single **CTE chain** — one named
CTE per step:

```sql
WITH step_1 AS (SELECT * FROM users),
     step_2 AS (SELECT * FROM step_1 WHERE active = true),
     step_3 AS (SELECT * FROM step_2 WHERE id >= 100)
SELECT * FROM step_3
```

This keeps the generated SQL readable, debuggable, and easy to compose — and it's always
visible to the user in the generated SQL panel (live-updating, copyable). The **Raw SQL**
step type is the escape hatch: it receives the previous step as a named CTE
(`WITH prev AS (...)`), so users can drop into arbitrary SQL without breaking the chain.

Execution is live: as the user edits a step's config, the query for that step (and every
step after it) re-runs automatically (debounced) against `tauri-plugin-sql`, and each step
renders its own intermediate result inline. Live preview results are capped at N rows;
the full, uncapped result set is only fetched on explicit export.

If a step errors (bad SQL, missing column, etc.), every downstream step enters a "blocked"
state and does not execute — errors propagate forward through the chain, never silently.

See `docs/product-spec.md` for the full breakdown of step types, JOIN modes, and the
pipeline interaction model (drag-reorder, undo/redo, error badges, etc.).

## Workspace Model

A **workspace** is a named collection of one or more `.db` files. Quarry uses SQLite's
`ATTACH DATABASE` to make cross-file JOINs possible within a workspace — the schema browser
shows each attached file as a collapsible section, with its ATTACH alias visible next to the
filename (so users can see where the `alias.table` prefix in generated CTE SQL comes from).

Workspaces persist to the app data folder by default (zero friction to resume), and can be
exported as a `.quarry` config file to share or version-control.

## Release Pipeline & Auto-Updates

Distribution is via GitHub Releases, consumed in-app by `tauri-plugin-updater`. Users see an
in-app banner when an update is available — downloading and installing is always a manual,
two-click action (no silent background installs).

**Build pipeline:** GitHub Actions matrix build (macOS arm64, macOS x64, Windows) triggered
on `v*` tag push, via `tauri-action`.

**The manifest-assembly problem:** `tauri-action` repacks the signed `.tar.gz` artifact
*before* reading its signature, which breaks the signature match in the `latest.json` update
manifest it generates. The fix (shipped in v0.1.2) is a dedicated `finalize` job that runs
*after* all matrix builds complete, and assembles `latest.json` itself directly from the
already-signed `.tar.gz.sig` / `.exe.sig` files — bypassing `tauri-action`'s own manifest
generation entirely.

This is a structural property of multi-architecture matrix builds, not a one-off bug: the
build tool's default manifest assembly does not survive being run per-architecture and then
merged. If you're touching the release workflow, the rule is **assemble the final update
manifest yourself, after signing, in a dedicated step** — don't trust the per-arch build
outputs to compose correctly on their own.

**Testing the update flow locally:** the only way to exercise the real chain — detect,
download, signature verification, install, relaunch — is on a real install, and asking
David + a friend to babysit every release doesn't scale. `scripts/local-update-test.ts`
runs that chain end-to-end on localhost:

1. `bun scripts/local-update-test.ts baseline <low version>` — builds and opens an
   installable "old" app (`QuarryUpdateTest` / `dev.quarrydb.app.localtest`, distinct
   identifiers so it can never collide with your real Quarry install).
2. Install and launch it.
3. `bun scripts/local-update-test.ts release <higher version>` — builds a "new" version,
   signs the updater artifact, writes `latest.json`, and serves both on `localhost:17420`.
4. In the running baseline app, trigger "Check for Updates…" (or wait for the 4-minute
   background poll) and watch it detect, download, verify, install, and relaunch into
   the new version for real.

Both builds are signed with a dedicated test-only keypair (gitignored, generated once via
`bunx tauri signer generate --ci -p "" -w scripts/local-update-test/keys/test.key`) and
point `plugins.updater.endpoints` at `localhost` instead of GitHub Releases — fully
decoupled from the production signing key and pipeline, so there's no risk to either.
Logic-level regressions (banner triggering, `update.body` parsing, polling cadence) are
covered separately by `src/app/core/services/updater.service.spec.ts`'s mocked unit tests.

**Differential ("delta") updates — investigated, declined (2026-06-07):** full update
bundles are already small (~6MB macOS, ~4MB Windows), and Tauri has no built-in support for
binary-diff updates (open upstream request: `tauri-apps/tauri#11863`, unaddressed since
Dec 2024). Building it ourselves would mean bypassing `tauri-plugin-updater` for a custom
patch-and-replace flow on a signed executable — high complexity and risk for savings that
compiled-binary diffing likely wouldn't even deliver (small source changes reshuffle binary
layout, so patches stay large). Revisit only if the bundle grows substantially or Tauri
ships native support.

## Known Platform Issues

### macOS: "app is damaged" on first install

The app is not signed with an Apple Developer certificate, so Gatekeeper blocks it after
download. One-time workaround after dragging to `/Applications`:

```bash
xattr -cr /Applications/Quarry.app
```

Permanent fix requires an Apple Developer Program membership ($99/yr) + notarization — the
GitHub Actions workflow already supports this via `tauri-action`, it just needs
`APPLE_CERTIFICATE` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` secrets configured.

### Windows: SmartScreen warning on first install

Same root cause (no code signing certificate). Workaround is a single click ("More info" →
"Run anyway"). Lower priority than macOS — fixing it requires an EV code signing certificate
(~$300/yr from a CA), and the workaround is trivial enough that it's not worth the cost yet.
