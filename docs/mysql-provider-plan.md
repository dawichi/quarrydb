# MySQL Provider Plan

This document defines the scope and boundaries for **MySQL as Quarry's second provider**.

The v1 scope below is now implemented. Treat the remaining non-goals as deliberate limits, and
use `docs/status.md` for the current implementation state.

It exists to keep the first non-SQLite provider practical. The goal is to validate the new
provider architecture with a real relational engine, not to accidentally build a full
MySQL administration suite in one pass.

## Goal

Ship a useful MySQL provider that proves Quarry can open more than one database family
without collapsing into a fake one-size-fits-all UI.

MySQL v1 should let a user:

- save and reopen MySQL connections
- browse schemas, tables, and rows
- run MySQL queries with visible SQL
- reuse Quarry's relational strengths where they genuinely fit
- feel like they are still in Quarry, not in a bolted-on second app

## Why MySQL First

MySQL is the right second provider because it forces the right architectural changes while
still preserving a relational workflow:

- remote server connection instead of local file open
- schema hierarchy instead of SQLite attached-file workspaces
- MySQL dialect instead of SQLite dialect
- provider-owned backend adapter instead of SQLite-specific assumptions

At the same time, it still shares enough with SQLite to make reuse worthwhile:

- tables and views
- row browsing
- SQL query execution
- row editing
- relational navigation patterns

## User Model

The user is a developer or technical operator who already uses MySQL at work and wants a
better UI than MySQL Workbench for common daily tasks.

The target workflow is not deep DBA work. It is:

- connect to a server
- inspect schemas/tables
- browse and filter data
- run ad hoc queries
- make cautious row-level edits

## MySQL v1 Product Shape

MySQL v1 should feel like a **provider mode** inside Quarry, not a clone of the SQLite
experience and not a totally separate application.

### Shared shell pieces to reuse

- home screen and recent items
- provider iconography and general visual design
- common layout chrome
- result table/grid primitives
- export flows where applicable
- query history patterns where applicable
- saved connection/resource metadata

### MySQL-specific pieces

- connection/open flow
- server/schema navigation model
- MySQL dialect execution
- provider-specific schema introspection
- provider-specific row editing path

## Connection Model

MySQL is not opened from a file picker. It is opened through a saved connection profile.

### Connection profile fields

MySQL v1 should support:

- connection name
- host
- port
- username
- password
- default database/schema (optional)

Likely useful optional fields:

- SSL mode
- connection color / label

But these are not required for the first usable version.

### Recent-item shape

A recent MySQL item should store enough metadata to reconnect clearly from the home screen:

- provider id: `mysql`
- display name
- host:port subtitle
- optional default database/schema
- reconnect payload pointing to the saved connection profile

The recent item should never store raw credentials directly if the broader connection model
ends up separating profile metadata from secret storage.

### Secret handling

Do not over-design this before implementation, but the intended direction is:

- Quarry stores connection metadata
- passwords/secrets should be isolated from ordinary recent-item/session metadata

If secure OS-backed secret storage is not part of v1, the fallback behavior and tradeoff
must be explicit before shipping.

Current credential-storage status:

- MySQL passwords are still excluded from profiles, recent items, and sessions by default.
- Users may explicitly opt into OS-backed storage for a profile; Quarry uses the platform
  credential store on macOS, Windows, and Linux where available.
- If the native store is unavailable, Quarry keeps the password in runtime memory and
  continues to require re-entry after relaunch.

## Workspace Model

MySQL v1 needs a different workspace shape from SQLite.

SQLite today:

- local file(s)
- optional attached databases
- file-centric schema browser

MySQL v1:

- one server connection
- multiple schemas/databases visible under that connection
- schema → table/view hierarchy

The app shell should treat both as provider-owned workspace payloads, not as variants of
one universal workspace structure.

## Sidebar / Navigation Model

The MySQL sidebar should prioritize common relational navigation:

- connection
- schemas/databases
- tables
- views

Nice-to-have later, but not required for v1:

- stored procedures
- functions
- events
- users/privileges
- process list

The rule is simple: ship the pieces needed for routine development workflows first.

## Querying Model

MySQL v1 must support raw SQL execution. That part is non-negotiable.

### Raw SQL

Users should be able to:

- open a SQL query view
- run arbitrary MySQL SQL
- see result rows
- copy/export results
- see errors clearly

### Visual relational querying

The current pipeline builder is one of Quarry's main differentiators, so it is worth trying
to adapt it for MySQL. But it should only ship in MySQL v1 if it can be done cleanly.

Requirements if it ships:

- generated SQL stays fully visible
- dialect differences are handled explicitly
- source selection works with MySQL schema-qualified tables
- no SQLite-only assumptions leak into the MySQL version

If those conditions are not met quickly, MySQL v1 should ship with raw SQL first and the
visual query builder should follow after the provider boundary is proven.

That is an acceptable outcome. The provider architecture is the prerequisite, not the
other way around.

Current implementation note: the pure SQL generator has an explicit SQLite/MySQL dialect
boundary, including MySQL backtick quoting and schema-qualified sources. MySQL now exposes
a provider-owned execution store and visual workspace for WHERE, SELECT, ORDER BY, GROUP BY,
JOIN, and RAW SQL, with persistence, export, and live integration coverage. The remaining
limits below are deliberate v1 boundaries.

## Data Browsing

MySQL v1 should support:

- selecting a table
- fetching rows with a sensible preview limit
- loading more rows
- basic ordering/filtering patterns consistent with Quarry's relational UX
- row count or approximate row count only if it can be shown without misleading users or
  causing obviously bad performance

SQLite assumptions about local-file performance and query cost should not be copied blindly
to MySQL. Remote latency and larger datasets change the UX tradeoffs.

## Row Editing

MySQL v1 should include row editing only if it can keep Quarry's current trust model:

- clear edit mode
- staged changes
- review before apply
- explicit failure reporting

Whether the exact same SQLite edit-mode machinery can be reused is an implementation
question. The product requirement is the trust model, not identical internals.

If row editing materially slows the provider rollout, it can be sequenced after browse +
query, but it should still be considered a near-term relational capability rather than a
long-term maybe.

## Schema Management

MySQL DDL support is not required to validate the provider architecture.

MySQL v1 should not try to reach SQLite DDL parity immediately.

Reasonable options:

- no DDL in v1
- minimal create/drop actions only after browse/query are solid

What should not happen is dragging in a broad schema-management project before the provider
foundation itself has proven out.

## Backend Adapter Direction

MySQL should sit behind a provider-owned backend adapter rather than being added directly to
SQLite-shaped generic services.

The concrete transport/library choice should be evaluated during implementation, but the
architectural rule is already decided:

- do not make generic app state depend directly on SQLite-only service contracts
- do not hide MySQL inside the existing SQLite service as "just another mode"

The provider layer should own:

- connection lifecycle
- schema introspection
- query execution
- row mutation APIs
- dialect-specific behaviors/errors

## Shared Relational Layer Candidates

These are good candidates for reuse between SQLite and MySQL if the abstractions stay
honest:

- result table/grid rendering
- query history model
- export model
- saved query UI patterns
- common relational navigation primitives
- some pipeline-builder UI and state patterns

These should remain provider-specific until proven otherwise:

- introspection queries
- SQL dialect generation
- workspace bootstrap
- connection/open flow
- DDL implementation
- edge-case edit semantics

## Non-Goals for MySQL v1

Explicitly out of scope:

- full MySQL Workbench replacement on day one
- user/role/privilege management
- server process monitoring and killing queries
- replication, backups, failover, clustering
- migration framework or schema diff tooling
- stored procedure / function / event management
- SSL/tunnel/enterprise auth permutations beyond what is necessary to make a basic
  development connection work
- perfect parity with every SQLite feature
- adding Postgres/Redis/Mongo in the same implementation wave

If implementation starts touching those areas, the scope has drifted.

## Build Order

Suggested sequence:

1. Provider architecture refactor
   - provider ids
   - recent item model
   - workspace host boundary
   - SQLite provider extraction
2. MySQL connection flow
   - save/open connection profiles
   - connect/disconnect
   - recent items integration
3. MySQL browse flow
   - sidebar schemas/tables/views
   - row browsing
   - export
4. MySQL query flow
   - raw SQL execution
   - query history integration
5. Optional relational enhancements
   - pipeline builder adaptation if clean
   - staged row editing if ready

This order is deliberately biased toward proving the architecture with the smallest useful
feature set first.

## Success Criteria

MySQL v1 is successful if:

- Quarry can reopen either a SQLite resource or a MySQL resource from the same home screen
- the active workspace switches to the correct provider-specific experience
- MySQL users can complete browse + query workflows comfortably
- the resulting architecture makes Postgres feel easier later, not harder

It is not necessary for MySQL v1 to match every mature MySQL client feature.

## Related

- `multi-engine-architecture.md`
- `roadmap.md`
- `status.md`
- `architecture.md`
