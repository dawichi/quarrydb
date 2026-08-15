# Data ownership and recovery runbook

Quarry is a database client, not a backup system. The database server or the local database
file remains authoritative, and every export created by Quarry is a user-owned copy that must be
protected separately.

## At a glance

| Resource | Quarry stores | Recovery authority | Important limit |
| --- | --- | --- | --- |
| SQLite database | Path and workspace metadata; optional exported files | The original database file and the user's filesystem backups | CSV/JSON/SQL exports are not a complete SQLite backup; active WAL databases must be copied consistently |
| MySQL | Connection metadata, workspace/session metadata, and runtime or opt-in keyring credentials | MySQL backup/snapshot/PITR tooling or the managed service | Quarry transactions roll back failed staged edits, but Quarry does not provide server backup or point-in-time recovery |
| Redis/Valkey | Connection metadata, workspace/session metadata, and runtime or opt-in keyring credentials | Redis RDB/AOF, replication, or managed-service backups | Bounded keyspace JSON export is an inspection/export aid, not a restore image; TTLs and server configuration remain server-owned |
| Sessions/recent items | Non-secret navigation and pipeline metadata in local app storage | Reopen the resource or clear corrupted local metadata | Credentials are deliberately absent and must be re-entered when keyring access is unavailable |
| Quarry exports | User-selected CSV, JSON, SQL, or Markdown files | The filesystem backup policy for the destination | Exports can contain sensitive data and may be stale or intentionally bounded |

## SQLite recovery

1. Stop writes before making a backup. Close Quarry and confirm no other process is writing the
   database.
2. Copy the database to a separate backup location without replacing the original. If the
   database uses WAL mode, preserve the database's WAL/SHM state consistently or use SQLite's
   official backup tooling rather than copying only one file during active use.
3. Verify the copy with an independent SQLite integrity check before relying on it. Quarry does
   not silently run or upload integrity checks.
4. To recover, keep the damaged file for investigation, copy the verified backup to a new path,
   and open that new path in Quarry. Do not overwrite the only remaining copy.

Schema-management operations and staged row edits are transactional where supported. A failed
operation is rolled back by the adapter, but a successful destructive operation is not an
alternative to a backup.

## MySQL recovery

MySQL remains authoritative for remote data. Use the database operator's normal backup policy:
logical dumps, physical snapshots, replication-based recovery, or managed-service point-in-time
recovery as appropriate for the server.

Quarry's staged row edits and DDL paths use transaction boundaries and roll back when the adapter
reports a failure. If a connection drops after the server accepts a statement, verify the server
state before retrying; do not assume that a client-side error means the statement was not applied.
For accidental successful changes, recover through the server's backup/binlog or snapshot process.

## Redis/Valkey recovery

Redis persistence, replication, eviction policy, ACLs, modules, and cluster topology belong to
the server or managed service. Configure and verify RDB/AOF or provider-native backups outside
Quarry before using the command runner for operational work.

Quarry's keyspace export is bounded and intended for inspection, migration assistance, or a
small diagnostic capture. It is not a complete backup: it does not capture every key unless the
user explicitly performs a bounded export that includes them, and it does not restore server
configuration, ACLs, modules, replication state, cluster topology, or exact operational timing.
TTL values should be treated as a point-in-time observation.

The Redis command runner accepts explicit argument arrays, including destructive commands. There
is no generic undo. Before `DEL`, `UNLINK`, `FLUSH*`, expiration, or application-level mutation,
confirm the target database and rely on the server's backup/recovery policy.

## Local metadata and credentials

Sessions, recent items, saved queries, profiles, and history are convenience metadata. If a
session is corrupt or references a removed resource, Quarry rejects it or asks for reconnection;
reopening the database or connection creates fresh workspace state. Clearing local metadata does
not restore database contents.

Passwords are never part of sessions, recent items, query history, or exports. When an OS keyring
entry is unavailable, re-enter the credential and optionally save it again through the explicit
secure-storage option. Quarry cannot recover a password that the operating system credential
store no longer provides.

## Export and incident checklist

Before a potentially destructive operation:

1. Confirm the provider, host/path, schema/database, and selected keyspace.
2. Confirm that a provider-native backup or verified SQLite copy exists when the data matters.
3. Prefer a bounded preview or read-only query first.
4. Record the generated SQL or Redis command and the intended scope.
5. After a timeout or connection error, reconnect and inspect the affected rows/keys before
   retrying.

If an export fails, the destination may be absent or partial; verify the file before sharing or
deleting the source data. If an export succeeds, protect it according to its sensitivity and do
not treat it as a live synchronized backup.

## Scope boundary

Quarry currently provides no backup scheduler, restore wizard, server snapshot integration,
point-in-time recovery, Redis keyspace restore, or cloud archival. Those would be separate
features requiring provider-specific safety design and explicit confirmation flows.
