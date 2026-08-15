# Quarry Standards and Maturity TODOs

This backlog tracks durable standards gaps and provider maturity work. Completed work belongs
in the milestone history or an ADR; do not silently delete unresolved items.

### QRY-001 [High] DEP-006 — Add dependency vulnerability scanning

- **Status:** Planned
- **Affected area:** CI, Bun workspace, `src-tauri/`
- **Evidence:** `bun pm scan` reports that no security scanner is configured.
- **Risk:** Vulnerable JavaScript or Rust dependencies may remain invisible.
- **Next action:** Add repeatable JavaScript and Rust scanners and a documented response path.

### QRY-002 [High] CI-003 — Pin the complete build toolchain

- **Status:** Planned
- **Affected area:** package metadata, CI, release workflow, Rust toolchain
- **Evidence:** CI pins Bun, but release uses an unpinned Bun install and floating Rust stable.
- **Risk:** Release artifacts may differ from verified builds.
- **Next action:** Pin Bun and Rust consistently and use frozen installs everywhere.

### QRY-003 [Critical] SEC-004 — Harden runtime-controlled SQL identifiers

- **Status:** Planned
- **Affected area:** SQLite/MySQL adapters and shared SQL utilities
- **Evidence:** Several SQLite queries interpolate table and column metadata without centralized escaping.
- **Risk:** Unusual or malicious metadata can produce malformed or unsafe SQL.
- **Next action:** Centralize dialect-aware quoting and add hostile identifier tests.

### QRY-004 [High] DATA-001 — Define ownership and recovery boundaries

- **Status:** Planned
- **Affected area:** SQLite, MySQL, Redis, localStorage, keyring, exports
- **Evidence:** Quarry modifies user-owned databases but does not document a complete backup/recovery contract.
- **Risk:** Users may mistake exports or transactions for durable backup and recovery.
- **Next action:** Document ownership, retention, backup responsibility, destructive-operation recovery, and provider failure behavior.

### QRY-005 [High] ANGULAR-006 — Validate persisted and remote runtime data

- **Status:** Planned
- **Affected area:** session/profile/history services and landing release loader
- **Evidence:** Runtime JSON is cast directly into TypeScript interfaces in multiple boundaries.
- **Risk:** Corrupt or changed data can enter application state unsafely.
- **Next action:** Add validators and malformed-data regression tests.

### QRY-006 [Medium] ASTRO-010 — Add landing browser coverage

- **Status:** Planned
- **Affected area:** `landing/`
- **Evidence:** Current Playwright coverage targets the Angular app, not the public landing page.
- **Risk:** Download/release metadata and interactive demo regressions may ship unnoticed.
- **Next action:** Add a focused landing smoke suite and build/link validation.
