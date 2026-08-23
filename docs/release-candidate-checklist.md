# Quarry 0.2.0 Release-Candidate Checklist

This is the acceptance gate for the first release that presents SQLite, MySQL, and Redis/Valkey
as usable provider workflows. Do not publish the `0.2.0` tag until every required gate is green
or has an explicitly recorded, reviewed exception.

## Release scope

| Provider | Release posture | Required workflow | Deliberate limits |
|----------|-----------------|-------------------|-------------------|
| SQLite | Stable local workflow | Open, browse, query, visual pipeline, staged edits, DDL, export, session restore | SQLCipher and backup/restore UX are deferred |
| MySQL | Stable relational workflow | Connect, reconnect, browse/filter/sort, visual pipeline, staged row edits, export, optional OS-backed password | No DBA administration, migrations, procedures, privileges, or process-list tooling |
| Redis/Valkey | Supported bounded key/value workflow | TCP/TLS connect, typed previews, targeted mutations, TTL/delete, command runner, bounded JSON export | No cluster topology, ACL administration, unbounded restore, pub/sub monitoring, or module editors |

Exports are user-requested outputs, not backups. Provider-owned backup and recovery remain the
responsibility of the filesystem, MySQL service, or Redis/Valkey deployment.

## Automated gates

Run the portable gates from the repository root:

```bash
bun install --frozen-lockfile
bun run check:ci
bun run check:docs
bun run audit:dependencies
bun run test:run
bun run test:e2e
bun run test:landing
bun run build
bun run build:landing
(cd src-tauri && cargo fmt --check && cargo test && cargo check)
```

With Docker available, also run the real provider gates:

```bash
bun run test:mysql
bun run test:redis
```

The tag-triggered release workflow is the authoritative portable preflight. It must pass before
the platform packaging matrix runs, and its browser artifacts should be retained with the release
record.

## Native platform gates

Run [`native-shell-smoke-checklist.md`](native-shell-smoke-checklist.md) against the signed
artifacts produced by the candidate workflow, not an unsigned local build.

### macOS

- [ ] Install and launch on a disposable account.
- [ ] Verify menu bar, open/save dialogs, diagnostics export, keychain access, and reset behavior.
- [ ] Open SQLite, connect to MySQL, connect to Redis/Valkey, and return home between providers.
- [ ] Verify export cancellation and selected file extensions.
- [ ] Update from the previous signed build and confirm restart into the candidate.
- [ ] Record Apple Silicon and Intel results when both artifacts are released.

### Windows

- [ ] Install and launch on a disposable account.
- [ ] Verify native menu, open/save dialogs, diagnostics export, Credential Manager, and reset behavior.
- [ ] Open SQLite, connect to MySQL, connect to Redis/Valkey, and return home between providers.
- [ ] Verify export cancellation and selected file extensions.
- [ ] Update from the previous signed build and confirm restart into the candidate.
- [ ] Record installer, uninstall, SmartScreen, and updater results.

## Exit record

Record this information in the release issue or tag notes:

```text
Candidate tag:
Commit:
Automated preflight:
MySQL integration:
Redis integration:
macOS smoke:
Windows smoke:
Updater from previous release:
Known exceptions:
Decision: ship / hold
```

The release is ready only when the decision is `ship`, the known limitations match the published
notes, and no credential, user database, query text, or provider data has been attached to the
record.
