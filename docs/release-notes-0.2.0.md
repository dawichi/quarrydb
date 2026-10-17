# Quarry 0.2.0

Status: draft until the smoke test in [release.md](release.md) is recorded.

## Highlights

- **A pipeline that means what it says.** Every block refers to the flowing rows by the source
  table's name, so `orders.customer_id = customers.id` works in any position and keeps working
  when blocks are reordered.
- **JOINs without surprises.** Joined columns never collide: `customers.id` arrives as
  `customers_id`. Picking a table pre-fills the ON condition from naming conventions.
  (Previously a JOIN could fail on MySQL with "Duplicate column name", or on SQLite silently
  filter the wrong `id` column in later steps.)
- **Variables are parameters.** `:min_total` values are bound safely, numbers compare as numbers,
  and an unset variable is reported on its block.
- **MySQL gets the full pipeline.** The same builder as SQLite: undo/redo, drag to reorder,
  branch and subpipeline joins, saved queries and history.
- **Correct types.** A new native SQL layer returns exact decimals, real dates, JSON and binary
  values. MySQL browse sorting is numeric again (`1299.99` sorts above `79.99`).
- **Safer edits.** Staged edits run as one real transaction; if a row changed underneath you,
  nothing is applied.
- **Redis/Valkey** browser with typed previews, bounded edits and a command runner (no longer
  blocks the window while it works).

## Known limitations

- Installers are not notarized/code-signed. macOS needs `xattr -cr /Applications/Quarry.app` on
  first install; Windows needs "More info → Run anyway".
- A raw SQL block hides its columns from the compiler until it runs; a JOIN right after one
  prefixes every joined column.
- Long-running queries stop after 60 seconds; there is no cancel button yet.
- SQLite joins work within one database file.
- Exports are not backups.
