# ADR-0002: Native SQL layer and a schema-aware pipeline compiler

- Status: Accepted
- Date: 2026-10-17

## Context

Through 0.1.x and the unreleased 0.2 work, SQL went through `tauri-plugin-sql`, and the pipeline
compiler turned steps into CTEs without knowing their columns. This caused verified defects:

- A JOIN step emitted `SELECT *` over both tables. MySQL rejected it ("Duplicate column name
  'id'"); SQLite renamed the second column to `id:1`, so a later `WHERE id = …` silently
  filtered the wrong column.
- JOIN conditions had to reference internal CTE names (`step_2`) that changed when steps were
  reordered; the natural `orders.customer_id = customers.id` failed unless JOIN was first.
- The plugin decoded some MySQL types poorly, so the adapter cast columns to text for display.
  Sorting then ordered by the text alias, so `79.99` sorted above `1299.99`. A hand-written
  SQL rewriter grew around this workaround.
- `BEGIN … COMMIT` were separate plugin calls on a connection pool, so a "transaction" was not
  guaranteed to run on one connection.
- Variables were spliced into SQL text.
- MySQL had a forked, simpler copy of the pipeline UI and store.

## Decision

1. SQL runs in Rust through `sqlx` (`src-tauri/src/sql`). The webview opens a pool once and
   addresses it by a secret-free handle. Batches run on one connection, optionally as a
   transaction, with per-statement row expectations. Values are decoded by engine type.
2. The pipeline compiler (`packages/shared/src/pipeline-sql.ts`) is schema-aware: it tracks the
   columns of every step, names the flowing relation after the source table, projects JOINs
   explicitly, binds variables, and reports compile problems per step.
3. The pipeline store depends on a small `PipelineBackend` interface. Each SQL provider supplies
   one; there is one pipeline UI.
4. Compiler tests execute the generated SQL on real SQLite; CI runs the MySQL suites against a
   live server, and an IPC test pins the Rust/TypeScript command contract.

## Consequences

- Quarry owns ~600 lines of Rust that the plugin used to provide, and must track `sqlx`
  releases and advisories (policy in `src-tauri/.cargo/audit.toml`).
- Adding an engine means adding a `sqlx` driver (or another native client) plus a
  `PipelineBackend`, not a new pipeline UI.
- Pipelines saved before 0.2 keep working: `step_N.` references in JOIN conditions are
  rewritten to the source name.
- A raw SQL step hides its output columns until it runs, so a JOIN directly after it prefixes
  all joined columns.
