# Roadmap

This is the long-term map for Quarry — where `status.md` tracks "what's done and what's
next," this file answers "what is this project trying to become, and in what order."

## Long-Term Vision

Quarry is evolving from a SQLite-first desktop app into a broader database manager:

- one local-first app
- one consistent visual identity
- one recent-items / home experience
- multiple provider-specific workspaces underneath

The product goal is not "one generic UI for every database." The goal is one coherent app
that opens the right interface for the thing you opened:

- SQLite file
- MySQL server/schema
- Redis instance
- Postgres database
- Mongo database

See `multi-engine-architecture.md` for the architectural model behind that direction.

## Phases

These are generic checkpoints, not dated milestones. Each one is a long stretch of work in
its own right, refined as we go. See `status.md` for the concrete, current-state roadmap
within whichever phase is active.

### Phase 1 — SQLite-first vertical slice

Build a serious local SQLite tool first, so Quarry has a real product core before trying
to generalize.

Completed / largely satisfied:

- browse/query/edit rows
- visual pipeline builder with visible SQL
- JOIN branch + subpipeline modes
- schema management (tables, columns, indexes, views, triggers)
- export, saved queries, history, tutorial, updates

SQLite-specific future additions can still happen when a real workflow justifies them:

- `VACUUM` / integrity checks
- full-text search (FTS5)
- other SQLite-specific power tools

But SQLite perfection is no longer the gating factor for the next major architectural move.

### Phase 2 — Multi-engine foundation

This is now the active strategic phase.

The goal is to turn the current SQLite-shaped app into a provider-based app shell without
destroying what already works.

Core work in this phase:

- define a provider registry / provider contract
- separate shell-level state from SQLite-specific state
- introduce provider-aware recent items and session restore
- isolate SQLite-only assumptions behind a SQLite provider boundary
- identify which relational capabilities SQLite and MySQL can genuinely share

This phase is architecture-first. It should happen before shipping MySQL connection support.

### Phase 3 — MySQL as the second provider

MySQL is the first expansion target because it validates the provider model while still
living in the relational world.

The initial bar is practical, not maximal:

- save/open MySQL connections
- browse schemas/tables/rows
- run SQL queries
- adapt shared relational UI where it fits
- preserve Quarry's transparency and local-first UX

This phase should produce the first proof that Quarry is becoming a real multi-database
manager rather than a SQLite app with bolt-ons.

### Phase 4 — Production-grade polish

Important, but no longer ahead of the MySQL/provider work.

- full E2E coverage of golden-path flows (Playwright)
- performance at scale — large databases, wide tables, big result sets
- cross-provider UX consistency where appropriate
- code signing (Apple notarization, Windows EV cert) — see
  `architecture.md#known-platform-issues`

Polish continues incrementally throughout the other phases, but these items are not meant
to block the multi-engine pivot.

### Phase 5 — Additional providers

Once the provider model and MySQL path are real, expand outward:

- Postgres
- Redis
- MongoDB
- others only when a real workflow justifies them

The key rule is unchanged: do not abstract ahead of evidence. Add shared layers only when
at least two providers truly need them.

## Deferred Work

Two previously-listed roadmap items are intentionally deprioritized:

- encrypted SQLite (SQLCipher) — valid feature, but deferred until real demand exists
- code signing / notarization — valid production work, but deferred until the app has
  enough traction to justify the cost and operational overhead

## Related

- `status.md` — current implementation status, near-term roadmap, milestone log
- `multi-engine-architecture.md` — provider model and abstraction boundaries
- `mysql-provider-plan.md` — MySQL v1 scope and implementation boundaries
- `schema-management-plan.md` — historical SQLite DDL build plan
- `post-mvp-scoping.md` — JOIN modes and SQLCipher scoping notes
