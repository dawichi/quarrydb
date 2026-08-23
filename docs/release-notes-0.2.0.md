# Quarry 0.2.0

Status: draft until the release-candidate checklist is complete.

Quarry 0.2.0 turns the SQLite-first prototype into a practical three-provider desktop database
workspace while keeping the local-first, transparent workflow intact.

## Highlights

- MySQL is now a supported relational provider with saved connections, schema and table browsing,
  server-side filtering and sorting, visual query pipelines, staged row edits, reconnect flows,
  full-result exports, and optional OS-backed password storage.
- Redis and Valkey support TCP/TLS connections, typed previews for common value types, bounded
  collection and string mutations, TTL and deletion workflows, argument-based command execution,
  reconnect, and bounded JSON keyspace export.
- SQLite browsing and querying enforce bounded previews while keeping full-result export explicit.
- Provider operations now include clearer failure guidance, stale-request protection, reconnect
  behavior, bounded network operations, and credential-safe error handling.
- Diagnostics export provides a redacted app and provider state report without credentials or user
  database contents.
- The desktop shell is updated to Angular 22, Tauri 2.11.5, and Zone.js 0.16.2.

## Known limitations

- Quarry does not provide provider-native backup, point-in-time recovery, or restore workflows.
- MySQL support is for daily relational inspection and cautious row edits, not full DBA
  administration.
- Redis/Valkey cluster topology, ACL administration, unbounded restore, pub/sub monitoring, and
  module-specific editors are not included.
- SQLCipher support and platform notarization/code signing remain deferred pending product demand
  and operational justification.
- Full-result exports can be expensive and are intentionally explicit; bounded previews are the
  default.
