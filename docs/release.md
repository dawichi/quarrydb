# Releasing

A release is a `v*` tag. The tag workflow runs the full CI suite first, then builds macOS
(arm64, x64) and Windows installers and publishes the signed updater feed.

Builds are **unsigned for the operating system** (no Apple notarization, no Windows code
signing). They are still **signed for the updater**, which is what protects auto-updates.

## Before tagging

1. CI is green on `main`.
2. Versions match in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
3. The release notes (`docs/release-notes-<version>.md`) match what actually ships.
4. With Docker available, `bun run test:mysql` and `bun run test:redis` pass locally (CI runs
   them too).

## Smoke test (15 minutes, per OS)

Use a local `bun run tauri build` or the draft release artifacts, and disposable data only.

- Launch; open the sample SQLite database; build a pipeline with WHERE → JOIN → GROUP BY and
  check each block shows rows and the SQL panel reads well.
- Reorder two blocks; undo and redo.
- Stage one edit, apply it; stage another, discard it.
- Export a pipeline result as CSV and check the file.
- Connect to a local MySQL (`bun run dev:services:up`), load sample data, browse with a sort on
  `price`, and run the same pipeline. Disconnect and reconnect.
- Connect to local Redis, open a key, run one safe command.
- File → Export Diagnostics writes a report without credentials or data.
- Relaunch: the session restores (MySQL asks for the password unless remembered).
- From the previous release, "Check for Updates…" installs and relaunches into the new one.

Record OS version, artifact, result and any exception in the release notes or tag message.
Exports are not backups; see [recovery-runbook.md](recovery-runbook.md).

## Tagging

```bash
git tag v0.2.0
git push origin v0.2.0
```
