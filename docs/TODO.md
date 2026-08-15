# Quarry Standards and Maturity TODOs

This backlog tracks unresolved standards gaps and provider maturity work. Completed work is
recorded in `docs/status.md` or an ADR; do not silently delete unresolved items.

### QRY-004 [High] DATA-001 — Define ownership and recovery boundaries

- **Status:** Completed
- **Affected area:** SQLite, MySQL, Redis, localStorage, keyring, exports
- **Evidence:** `docs/recovery-runbook.md` defines provider ownership, backup/recovery authority,
  export limits, credential recovery, and failure handling for SQLite, MySQL, Redis, and local
  metadata.
- **Risk:** Quarry still has no backup scheduler, restore wizard, or provider-native snapshot
  integration; users must operate those through their filesystem/server tooling.
- **Next action:** Add provider-specific backup/restore UX only if product scope warrants it.

### QRY-005 [Medium] ANGULAR-006 — Deepen runtime validation

- **Status:** Completed
- **Affected area:** session/profile/history services and provider payloads
- **Evidence:** `src/app/core/services/session-validation.ts` validates versioned SQLite, MySQL,
  and Redis session payloads recursively, with valid/legacy/malformed fixtures in
  `session-validation.spec.ts`.
- **Risk:** Future persisted-state versions still need explicit migrations before the format
  changes.
- **Next action:** Add a migration when a persisted session schema needs to evolve.

### QRY-006 [Medium] ASTRO-010 — Add landing browser coverage

- **Status:** Completed
- **Affected area:** `landing/`
- **Evidence:** `landing-e2e/landing.spec.ts` runs against a production Astro preview and covers
  page metadata, release fallback links, and interactive pipeline/SQL/result behavior.
- **Risk:** Browser coverage intentionally does not replace platform-specific native shell smoke.
- **Next action:** Keep the focused suite stable as the landing page evolves.

### QRY-007 [High] Redis provider depth

- **Status:** In progress
- **Affected area:** Redis/Valkey workspace
- **Evidence:** connection, key browsing, typed previews, string editing, TTL, deletion, and
  command execution, plus bounded pattern-scoped JSON keyspace export, are implemented;
  collection editors, cluster, ACL, and restore workflows are not.
- **Risk:** Redis is useful for inspection and targeted operations but not yet a full keyspace
  administration tool.
- **Next action:** Add focused list/set/hash/sorted-set editors only after defining mutation
  confirmation, conflict, and per-type preview limits.

### QRY-008 [Medium] Native shell smoke coverage

- **Status:** Planned
- **Affected area:** Tauri webview, OS dialogs, menus, updater
- **Evidence:** browser tests mock IPC and Rust tests cover native Redis boundaries; no automated
  macOS/Windows native-driver suite is configured.
- **Risk:** platform-specific dialogs or capability wiring can regress outside browser tests.
- **Next action:** add a small `tauri-driver` smoke suite or retain a per-release manual checklist.
