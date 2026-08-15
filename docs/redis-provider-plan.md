# Redis provider

Redis is implemented as a key/value provider, not as a relational adapter. The current
provider targets Redis-compatible servers (including Valkey) over TCP or TLS and keeps the
native socket boundary inside Tauri.

## Supported workflow

- connect to a local or remote server with host, port, logical database, optional ACL username,
  password, and TLS;
- save connection metadata and optionally store the password in the OS credential store;
- scan keys with a bounded `SCAN` count and optional pattern;
- inspect strings, lists, sets, sorted sets, hashes, and streams with bounded previews;
- edit string values and positive-millisecond TTLs, delete keys, and run argument-based Redis
  commands;
- restore recent items and sessions without serializing passwords into localStorage.

## Boundaries and safety

The webview never opens a Redis socket. Each native operation receives a typed target and the
runtime password through one Tauri command. Host URL characters are validated, credentials are
URL-encoded, TLS uses `rediss://`, and native reads/writes have a ten-second connection timeout.
The command runner deliberately supports arbitrary Redis commands; the UI labels it as a
privileged/destructive surface and passes argument arrays rather than shell-parsed text.

Key scans and collection previews are bounded. Full keyspace exports, pub/sub monitoring,
cluster topology administration, Lua/script management, ACL administration, and module-specific
editors remain follow-up work because they need distinct UX and stronger operational safeguards.

## Test strategy

- Vitest covers command parsing, native invoke contracts, persistence/profile validation, and
  provider state transitions.
- Rust unit tests cover URL construction, TLS/IPv6 formatting, and hostile target rejection.
- CI provisions Docker Redis and exercises PING, SCAN, typed values, TTL writes, deletion, and
  representative command execution through the native boundary. Local execution uses the same
  `bun run test:redis` harness when Docker is available.
