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

## Temporary Tech-Lead Direction — 2026-08-16

The current recommendation is to stop expanding provider breadth and take the existing
SQLite, MySQL, and Redis verticals to release-candidate quality. Revisit this section after
real usage data and the next product review.

### QRY-009 [High] Provider operational reliability

- **Status:** Planned
- **Affected area:** SQLite, MySQL, Redis connection and operation lifecycles
- **Goal:** Make connection loss, reconnects, timeouts, cancellation, stale requests, and
  categorized failures predictable across providers.
- **Next action:** Define the shared failure contract first, then implement provider-specific
  deadlines and reconnect UX where the native drivers support them.

### QRY-010 [High] Release-candidate acceptance

- **Status:** In progress
- **Affected area:** Tauri shell, installers, updater, keyring, dialogs, menus, CI
- **Goal:** Establish a repeatable release gate for all three providers and both supported
  desktop platforms.
- **Next action:** Validate the tag-triggered preflight and platform matrix in the first release
  candidate; host-dependent installer smoke tests remain an explicit manual gate.

### QRY-011 [High] MySQL maturity

- **Status:** Planned
- **Affected area:** remote MySQL browsing, editing, metadata, and TLS connections
- **Goal:** Make the supported remote relational workflow reliable on larger schemas and during
  concurrent changes.
- **Next action:** Add stale-row detection from affected-row counts, improve metadata loading
  for schemas with many tables, and harden transaction/reconnect behavior.

### QRY-012 [Medium] SQLite maturity

- **Status:** Planned
- **Affected area:** local SQLite file opening and large-table browsing
- **Goal:** Make local-file edge cases understandable and safe without weakening the current
  transaction and preview boundaries.
- **Next action:** Document read-only/open-mode expectations, handle locked databases and
  WAL/busy behavior explicitly, and measure large-table browsing performance.

### QRY-013 [Medium] Redis depth gate

- **Status:** Deferred pending usage evidence
- **Affected area:** Redis/Valkey cluster, ACL, and restore workflows
- **Goal:** Avoid turning a useful bounded inspection and mutation workspace into an
  underspecified administration product.
- **Next action:** Do not start cluster, ACL administration, or restore UX until real usage
  validates the need and the operational safety boundaries are written first.

### QRY-014 [Medium] Diagnostics and supportability

- **Status:** In progress
- **Affected area:** provider errors, logs, support exports, privacy boundaries
- **Goal:** Make production failures actionable without exposing credentials, query secrets, or
  user data unintentionally.
- **Next action:** Validate the native save-dialog flow on macOS and Windows; the default report
  intentionally excludes connection details and user data.

### Performance note

The Angular initial bundle warning budget is intentionally 550 kB with a 1 MB error ceiling;
the current measured initial bundle is about 522 kB. Do not spend roadmap capacity replacing
established UI dependencies for this small margin unless measured startup performance regresses.
