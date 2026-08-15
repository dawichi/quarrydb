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
  command execution, bounded pattern-scoped JSON keyspace export, and safe typed collection edits
  are implemented; cluster, ACL, and restore workflows are not.
- **Risk:** Redis is useful for inspection and targeted operations but not yet a full keyspace
  administration tool.
- **Next action:** Define cluster/ACL/restore scope only after real usage validates the current
  bounded key browser and typed mutation workflows.

### QRY-008 [Medium] Native shell smoke coverage

- **Status:** Completed
- **Affected area:** Tauri webview, OS dialogs, menus, updater
- **Evidence:** `docs/native-shell-smoke-checklist.md` defines the platform-specific release
  smoke layer and its relationship to automated browser, Rust, provider, build, and updater
  checks.
- **Risk:** platform-specific dialogs, keyring behavior, installer behavior, and updater
  replacement still require a disposable macOS/Windows host; no native-driver suite is forced
  into the cross-platform CI job.
- **Next action:** add `tauri-driver` coverage only when dedicated platform runners justify its
  maintenance cost.
