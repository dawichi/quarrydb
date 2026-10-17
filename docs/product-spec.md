# Product Spec

What each feature does today and why. For how it is built, see
[architecture.md](architecture.md); for what comes next, see [roadmap.md](roadmap.md).

## Who it is for

Developers who understand their data but want to *see* what a query does: people learning SQL,
people debugging someone else's query, and people who think in `.filter().map()`. SQL stays
visible on purpose; Quarry teaches it rather than hiding it.

## The pipeline (SQLite and MySQL)

A pipeline starts from a table and stacks blocks. Each block shows its own rows and its effect
(`14 → 3 rows`, `+customers_id`, ~~`status`~~ for added and dropped columns), updating live as
you type.

| Block | What it does |
|-------|--------------|
| WHERE | Filter rows with an expression; column chips insert names |
| SELECT | Pick, rename or compute columns (drag to reorder) |
| ORDER BY + LIMIT | Sort and cut |
| GROUP BY | Group with COUNT/SUM/AVG/MIN/MAX |
| JOIN | Join another table (inline, branch, or a nested subpipeline) |
| Raw SQL | Escape hatch: `{src}` is the previous block's result |

How it behaves:

- **Names stay stable.** Every block can call the flowing rows by the source table's name
  (`orders.total`), at any position and after reordering.
- **JOIN results are flat and unambiguous.** Joined columns keep their names unless the left
  side already has them; then they become `<alias>_<column>` (e.g. `customers_id`). Picking a
  table pre-fills the ON condition when names follow the `<table>_id` convention.
- **Live, bounded previews.** Each block shows up to 50 rows plus the true count. Exports run
  the full query.
- **Errors stop the chain.** A failing block shows its error; later blocks show "blocked". Problems
  found before running (an unset `:variable`, an unknown table) appear the same way.
- **Edit freely.** Drag blocks to reorder, undo/redo with Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z.
- **Visible SQL.** A collapsible panel shows the generated SQL with variable values inlined, with
  a copy button.
- **Variables.** `:name` placeholders get an input bar; values are sent as parameters.
- **Saved queries and history.** Save a pipeline by name per table and database; optional local
  history logs pipelines once you stop editing.

## Browse

Paged table view with total row count, click-to-copy cells, copy-row-as-JSON, and server-side
sorting. SQLite foreign-key cells link to the referenced row, with a breadcrumb trail. MySQL
browse adds a text filter across columns.

## Edit mode

A separate Edit tab, so editing is never accidental. Inserts, updates and deletes are staged and
shown as a diff; "Apply" runs them as one transaction. If any statement fails, or a row was
changed or deleted by someone else in the meantime, nothing is applied.

## Schema management (SQLite)

Create tables; add, rename and drop columns; manage indexes, views and triggers; rename and drop
tables with a preview of cascading deletes.

## Redis / Valkey

Key browser with SCAN-based paging and pattern filter, typed previews (string, list, set, sorted
set, hash, stream) with bounded sizes, TTL and delete, collection edits, a command runner, and a
bounded JSON export.

## Workspace basics

- **Home:** open a SQLite file or the bundled sample, connect to MySQL or Redis, recent items.
- **Tutorial:** a short guided tour of the pipeline on the sample database.
- **Session restore:** the last workspace, table and pipeline come back on launch (MySQL asks for
  the password unless it is remembered in the OS keyring).
- **Export:** CSV, JSON, SQL `INSERT`s and Markdown, from tables or pipelines.
- **Updates:** an in-app banner; installing is always a manual choice.
- **Look:** dark theme only.
