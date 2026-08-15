# ADR-0001: Trust boundaries and provider data ownership

- Status: Accepted
- Date: 2026-08-15

## Decision

Quarry is a local-first desktop application, but it is also a client for databases that may be
remote and highly privileged. The Angular webview is treated as untrusted presentation code at
the boundary of native capabilities and database connections. Provider adapters own connection
construction, input validation, query execution, and error translation.

The boundaries are:

- Tauri IPC is the privileged boundary for OS integration, the keyring, file export, updates,
  and non-SQL providers such as Redis.
- SQLite databases and exported files remain user-owned data. Quarry must not silently copy them
  to a service or include them in telemetry.
- MySQL and Redis credentials are runtime secrets. Connection profiles and sessions persist
  non-secret targets only; passwords belong in the OS keyring or an explicitly supplied runtime
  value.
- Raw SQL and provider commands are deliberate user-authored input. Quarry displays generated or
  submitted commands and must parameterize values and quote identifiers wherever the provider
  protocol permits it.
- Generated previews are bounded views. Full fetches, exports, scans, and destructive statements
  must remain explicit actions with clear loading/error states.

## Consequences

Provider-specific UI may differ substantially. Relational providers can share SQL/pipeline
contracts, while Redis uses key/value browsing and command execution instead of pretending that
keyspace operations are SQL. Native commands need focused tests because browser tests alone do
not exercise the Tauri process, keyring, or remote socket behavior.

When a new persisted field is introduced, its owner, sensitivity, versioning, reset behavior, and
failure mode must be documented in the provider/session contract and covered by malformed-input
tests.
