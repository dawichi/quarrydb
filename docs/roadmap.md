# Roadmap

## What Quarry is for

Quarry helps programmers **see what a query does**. A query is built as a chain of visual
blocks (filter, select, sort, group, join), and every block shows the rows it produces, like
`.filter().map()` on an array. The generated SQL is always visible, so Quarry teaches SQL instead
of hiding it.

Engines are a means, not the goal. SQLite and MySQL exist so the pipeline runs on the
databases people actually have. Redis has a practical key browser but is not part of the
pipeline story.

## Principles

- **The pipeline is the product.** Work that makes it clearer, more visual or more correct beats
  work that adds breadth.
- **Shipped beats planned.** A release in users' hands is the only real progress. Nothing is "done"
  until a test run proves it.
- **No new engines until the pipeline earns them.** Postgres and MongoDB are out of scope until
  real users ask for them and the pipeline is excellent on SQLite and MySQL.

## Now — 0.2.0

- [x] Native SQL layer (`sqlx`) replacing `tauri-plugin-sql`: exact types, real transactions,
      timeouts
- [x] Schema-aware pipeline compiler: stable naming, explicit JOIN projection, bound variables
- [x] One pipeline UI for SQLite and MySQL
- [x] CI green and running everything the release runs
- [x] Row-flow on every block: `1,204 → 312 rows`, plus the columns it added or dropped
- [ ] Manual smoke test of a release build on macOS and Windows (see [release.md](release.md))
- [ ] Tag and publish 0.2.0

## Next — make the pipeline visual

Ideas in rough priority order. Each should start with a short goal/non-goal note in the PR.

1. **Flow diagram view:** a compact overview of the whole chain (blocks as nodes, row counts on
   the edges) next to the detailed cards.
2. **Structured JOIN builder:** pick left column / right column from dropdowns, with
   foreign-key suggestions from the schema (today ON is pre-filled from naming conventions).
3. **Structured WHERE builder** for simple conditions (column, operator, value) with the free
   expression as the advanced mode.
4. **Per-block explanations:** a one-line plain-language summary per block ("keeps orders over
   100", "one row per country").
5. **Live preview inside subpipelines.**
6. **Query cancellation** for long-running steps (MySQL `KILL QUERY`, SQLite interrupt).

## Later — only with evidence

- Code signing/notarization (when users report install friction).
- SQLCipher, FTS5, `VACUUM`/integrity tools for SQLite.
- Additional engines (Postgres first) — only after the items above.

## Not planned

- Becoming a general database administration tool (users, privileges, migrations, processes).
- Cloud sync, accounts, telemetry.
