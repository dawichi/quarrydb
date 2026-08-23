# Quarry Agent Instructions

This is the canonical project-specific instruction file for AI agents. The root
[`AGENTS.md`](../AGENTS.md) is a short redirect for tools that discover instructions there.

## Read first

1. Read this file.
2. Read [`docs/README.md`](README.md).
3. Read [`docs/project-standards.yml`](project-standards.yml).
4. Read the architecture, product, testing, and provider documents relevant to the change.

## Source of truth

- Current architecture and implementation facts: [`architecture.md`](architecture.md),
  [`status.md`](status.md), and the provider documents linked from [`README.md`](README.md).
- Product behavior and user-facing workflow: [`product-spec.md`](product-spec.md).
- Coding conventions: [`conventions/`](conventions/).
- Test commands and coverage boundaries: [`testing.md`](testing.md).
- Durable decisions: [`adr/`](adr/).
- Standards gaps and deferred work: [`TODO.md`](TODO.md).

The source code and configuration remain authoritative when documentation and implementation
disagree. Update current-state documentation when behavior or architecture changes.

## Project shape

Quarry is an installable Tauri 2 desktop application with an Angular 22 webview, shared
TypeScript packages, and an Astro landing site. SQLite and MySQL are provider-specific
relational workspaces. Redis is a provider-specific key/value workspace and MUST NOT be
forced through relational table or SQL abstractions.

The Tauri shell is a privileged local boundary, not a public backend. Treat file paths,
database metadata, persisted browser storage, remote database responses, updater responses,
and IPC arguments as runtime-controlled data.

## Working rules

- Preserve the provider boundary: shared shell behavior may be reused, but provider-owned
  connection, schema, query, persistence, and capability behavior stays provider-specific.
- Keep generated SQL visible and predictable. Raw SQL is an explicit user-authored escape
  hatch, not a reason to make other query construction unsafe.
- Preserve staged edits, transaction boundaries, rollback behavior, and destructive-operation
  confirmations.
- Prefer pure functions for SQL generation, normalization, validation, and data transforms;
  add unit tests for them.
- Do not introduce network or telemetry requirements into the local-first core.
- Do not add authentication, public API, server health checks, or identity-provider behavior
  unless the product scope changes.
- Do not make broad migrations or destructive database changes without explicit user scope,
  a reversible plan where possible, and tests for failure and recovery behavior.

## Documentation and ADR rules

- Update [`docs/README.md`](README.md) when maintained documentation is added or moved.
- Update [`docs/project-standards.yml`](project-standards.yml) when the effective standards,
  compliance state, exception, or deferred work changes.
- Use an ADR for durable architecture, security, persistence, provider, or release decisions.
- Keep temporary tasks in [`TODO.md`](TODO.md) or issue/PR tracking; do not turn them into
  permanent architecture facts.
- Record exceptions explicitly. `Deferred`, `Exception`, and `Unknown` are not equivalent to
  compliant.

## Verification commands

```bash
bun install --frozen-lockfile
bun run check:ci
bun run test:run
bun run test:e2e
bun run build
bun run build:landing
bun run qa
```

Optional provider checks:

```bash
bun run test:mysql
bun run test:redis
```

For native packaging, use the Tauri prerequisites and `bun run tauri build`. Do not commit
generated `dist/` or `src/styles.css` output.

## Safe change boundaries

- Treat user SQLite files and remote MySQL/Redis data as user-owned durable data. Never reset,
  delete, rewrite, or seed a real user resource without an explicit user action.
- Keep credentials out of profiles, sessions, query history, logs, bundles, and tests. Use the
  OS-backed keyring only for the opt-in remembered-secret path.
- Keep release signing keys and updater credentials in CI secrets only.
- Before changing Tauri capabilities, IPC commands, updater configuration, SQL execution, or
  provider persistence, add or update boundary tests and document the security consequence.
