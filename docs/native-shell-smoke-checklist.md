# Native shell smoke checklist

This checklist is the remaining platform-specific layer after the automated webview, Rust
boundary, provider integration, build, and release workflows pass. Run it for a release
candidate on each supported operating-system family, and attach the version/build identifier to
the release record.

## Automated gates first

Run the repository gates before opening the installed app:

```bash
bun run check:ci
bun run test:run
bun run test:e2e
bun run test:landing
bun run build
bun run build:landing
(cd src-tauri && cargo fmt --check && cargo test && cargo check)
bun run audit:dependencies
```

The release workflow must also complete the signed installer and updater-feed jobs for the
target platform. Never use a local unsigned build to validate update signatures.

## Install and launch

- Install the artifact on a clean or disposable user account.
- Confirm the app launches without a terminal or developer-server dependency.
- Confirm the window title, minimum size, resize behavior, icon, and app version.
- Close and relaunch the app; confirm local metadata restoration does not require a network.
- Confirm a malformed or stale saved session falls back to a safe reconnect state rather than
  opening the wrong resource.

## Native menus and dialogs

- File → Open Database opens the platform file picker and opens the selected SQLite database.
- File → Open Sample opens the bundled/sample flow.
- Edit → Hard Reset clears local convenience metadata and relaunches without touching user
  database files.
- File → Check for Updates opens the update status flow and reports unavailable network/update
  states without crashing.
- SQLite and MySQL/Redis export flows open the native save dialog, honor cancellation, and write
  the selected extension without silently overwriting an unrelated file.
- Menu actions still work after switching between SQLite, MySQL, and Redis workspaces.

## Provider/native boundaries

- SQLite: open a real user-owned file, browse, stage/apply one safe edit, cancel one edit, and
  confirm the file remains available after relaunch.
- MySQL: connect to a disposable local or remote test server, disconnect/reconnect, and verify a
  failed connection does not expose the password in the visible error.
- Redis/Valkey: connect locally and remotely when available, inspect a typed key, run one safe
  command, use a typed collection edit, export a bounded JSON snapshot, and verify the keyspace
  remains unchanged after Back to Home.
- Remembered-secret flows store and retrieve credentials only through the OS credential store;
  when unavailable, the UI explains that the password remains runtime-only.

## Updater and recovery

- From an older signed build, check for a newer signed release and confirm the modal progresses
  through download, install, and restart.
- Cancel or interrupt the update where the platform permits it; confirm the app remains usable
  and the next check can retry.
- Confirm an invalid/unreachable update endpoint reports an error without corrupting the current
  installation.
- Confirm the provider recovery guidance in [`recovery-runbook.md`](recovery-runbook.md) is
  available to the release reviewer and that no one treats exports as backups.

## Platform notes

### macOS

- Check the menu bar, file/save panels, Gatekeeper/notarization behavior for the shipped artifact,
  keychain access, DMG installation, app replacement during update, and both Apple Silicon and
  Intel artifacts where released.

### Windows

- Check the native menu, Open/Save dialogs, Windows Credential Manager, NSIS installation and
  uninstall, SmartScreen/signing behavior for the shipped artifact, and updater replacement.

Record failures with the OS version, artifact name, app version, provider, and exact user action.
Do not use production databases or credentials for this checklist.
