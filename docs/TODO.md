# Quarry Standards and Maturity TODOs

This backlog tracks unresolved standards gaps and provider maturity work. Completed work is
recorded in `docs/status.md` or an ADR; do not silently delete unresolved items.

### QRY-004 [High] DATA-001 — Define ownership and recovery boundaries

- **Status:** In progress
- **Affected area:** SQLite, MySQL, Redis, localStorage, keyring, exports
- **Evidence:** `docs/adr/0001-trust-boundaries-and-provider-data.md` defines ownership and
  secret boundaries, but there is no backup/restore UI or provider recovery runbook.
- **Risk:** Users may mistake exports or transactions for durable backup and recovery.
- **Next action:** Add explicit backup/recovery guidance and provider-specific failure runbooks.

### QRY-005 [Medium] ANGULAR-006 — Deepen runtime validation

- **Status:** In progress
- **Affected area:** session/profile/history services and provider payloads
- **Evidence:** malformed localStorage tests now cover recent items, MySQL profiles, and query
  history; session payload validation remains intentionally shallow.
- **Risk:** Corrupt or changed persisted data can still enter application state unsafely.
- **Next action:** Add versioned validators/migrations for every persisted provider session.

### QRY-006 [Medium] ASTRO-010 — Add landing browser coverage

- **Status:** Planned
- **Affected area:** `landing/`
- **Evidence:** the landing production build and release-payload validator are covered, but the
  browser suite targets the Angular app only.
- **Risk:** Download/release metadata and interactive demo regressions may ship unnoticed.
- **Next action:** Add a focused landing smoke suite and build/link validation.

### QRY-007 [High] Redis provider depth

- **Status:** Planned
- **Affected area:** Redis/Valkey workspace
- **Evidence:** connection, key browsing, typed previews, string editing, TTL, deletion, and
  command execution are implemented; collection editors, export, cluster, and ACL workflows
  are not.
- **Risk:** Redis is useful for inspection and targeted operations but not yet a full keyspace
  administration tool.
- **Next action:** Add focused collection editors and bounded keyspace export after real usage
  validates the workflows.

### QRY-008 [Medium] Native shell smoke coverage

- **Status:** Planned
- **Affected area:** Tauri webview, OS dialogs, menus, updater
- **Evidence:** browser tests mock IPC and Rust tests cover native Redis boundaries; no automated
  macOS/Windows native-driver suite is configured.
- **Risk:** platform-specific dialogs or capability wiring can regress outside browser tests.
- **Next action:** add a small `tauri-driver` smoke suite or retain a per-release manual checklist.
