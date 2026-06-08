# Schema Management (DDL) — Feature Plan

## Goal

Let users visually create, alter, and drop schema objects — tables, columns, indexes,
views, triggers — with the same transparency and trust guarantees that already define the
rest of the app: generated SQL is always visible, changes are staged and reviewable before
they run, and execution is atomic with rollback on failure (the same model Edit Mode
already proved out for row data).

This is the single biggest capability gap on the way to a "full-featured SQLite app" (see
`roadmap.md`): Quarry can already browse, query, and edit row *data*, but has no way to
touch *structure*. `database.service.ts` only introspects existing schema via `PRAGMA` —
there's no DDL generation anywhere in the app.

## Checkpoints

Rough build order. Each one should ship independently and be useful on its own — no
"everything lands in one giant PR."

1. **Surface views & triggers in the schema browser** (read-only)
   - The sidebar query is currently hardcoded to `sqlite_master WHERE type='table'`
     (`database.service.ts:153`) — views and triggers are invisible today
   - Add `type='view'` / `type='trigger'`, and show their definitions — the stored SQL is
     already sitting in `sqlite_master.sql`, no generation needed
   - Lowest-risk checkpoint: pure introspection, no new SQL-generation logic, immediately
     useful for anyone working with real-world schemas that lean on views

2. **Create table**
   - Visual builder: name, columns (name, type, nullability, default, PK, FK), generates
     `CREATE TABLE …`
   - Same preview-before-execute trust model as Edit Mode

3. **Index management**
   - Create / drop indexes visually (`CREATE INDEX` / `DROP INDEX`)
   - Structurally simpler than table alteration — a good place to establish the
     "destructive op" confirmation pattern that checkpoint 5 will need

4. **Alter table** — add/rename column, rename table
   - SQLite's native `ALTER TABLE` is intentionally minimal: adding and renaming columns
     work directly, but changing a column's type/constraints or dropping it requires the
     "rebuild dance" (create new table with the new shape, copy data across, drop the old
     one, rename, then recreate any indexes/triggers/views that referenced it)
   - The generated script for a rebuild must be shown *in full* — not hidden behind a
     friendly button — staying true to the transparency principle when it matters most

5. **Drop schema objects** (tables, columns, indexes, views, triggers)
   - Genuinely destructive and irreversible at the schema level — no row-level undo to
     fall back on like Edit Mode has. Needs a stronger confirmation pattern, e.g.
     type-the-object-name-to-confirm, not just a diff-and-confirm dialog

6. **Views & triggers — create / edit**
   - By this point the staged-preview wrapper and raw-SQL-with-confirmation patterns
     already exist from earlier checkpoints — this is mostly wiring a textarea-style editor
     into that machinery, not new SQL-generation work

## Things to watch

So this doesn't quietly grow into a different, much bigger feature:

- **The ALTER TABLE rebuild path is the riskiest piece.** It moves real user data through
  intermediate tables — get it covered by integration tests against real `node:sqlite`
  (the same fixture edit-mode already uses) before calling DDL "done." A bug here means
  data loss, not a wrong query result.
- **Reuse the Edit Mode trust machinery — don't build a parallel one.** Staged changes,
  diff preview, atomic transaction, rollback-on-failure: that infrastructure already exists
  and is tested. DDL should extend it, not duplicate it.
- **This is not a migrations framework.** Quarry helps someone change a schema once,
  interactively, with full visibility into the SQL that runs. It deliberately does *not*
  do versioned up/down migration scripts, schema-change history, or multi-environment sync
  — that's a different product with different users.

## Testing

- **Unit** — DDL SQL generation (column/table/index definitions → SQL strings), same
  pattern as the existing CTE builder tests (pure function: input shape → output SQL)
- **Integration** — the `CREATE TABLE` and `ALTER TABLE` rebuild paths specifically,
  against the real `node:sqlite` fixture, asserting on actual schema state and actual data
  after the fact

## Related

- `roadmap.md` — long-term vision; this feature is the current focus of Phase 1
- `product-spec.md` — Schema Browser section (current read-only introspection)
- `architecture.md` — pipeline → CTE → SQL data flow, `DatabaseService` as the
  `tauri-plugin-sql` bridge
