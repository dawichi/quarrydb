# Product Spec

What each feature does and why it's shaped the way it is. For *how* it's built, see
`docs/architecture.md`. For *what's currently shipped vs. planned*, see `docs/status.md`.

## Target User

**SQL-curious developers** — people who understand data and relational structure but find
writing raw SQL friction-heavy. Blocks do the heavy lifting; SQL stays visible and
accessible, but secondary. Not aimed at non-technical users or raw-SQL power users, though
both can use it comfortably.

## Product Direction

Quarry started as a SQLite-first tool, but the product direction is now broader:

- one app for managing databases visually
- one shared home/recent-items experience
- provider-specific workspaces depending on what the user opens

That means the app should feel cohesive at the shell/design level, while still allowing
very different interfaces for different database families:

- SQLite / MySQL / Postgres can share some relational patterns
- Redis should look and behave like a key/value store tool
- Mongo should look and behave like a document database tool

The current shipped feature set described below is mostly the SQLite provider. Future
providers should reuse only the parts that genuinely fit them.

## Core Feature: Visual Query Builder / Pipeline

The star of the current SQLite-first product. Each step in the pipeline is a
transformation on the result set, with intermediate results shown live, inline, below each
step — inspired by functional array chaining (`.filter().map()`).

### Interaction model

- **Live execution with row cap** — results update automatically as the pipeline changes,
  capped at N rows for preview. Full uncapped result only on explicit export.
- **Expression input with visual hints** — every step config is a SQL fragment with
  clickable column chips and operator suggestions to insert. No form-only mode: this handles
  simple and complex conditions equally, instead of forcing a choice between the two.
- **Add step** — a "+" button at the bottom appends a step; hovering between two steps
  reveals an insert button. Both patterns coexist.
- **Drag to reorder** — full drag-and-drop with semantic validation: invalid drop targets
  are greyed out before release (e.g. you can't move a GROUP BY above its own column
  dependencies).
- **Error propagation** — if a step has an error, every downstream step shows a "blocked"
  state and does not execute.
- **Undo/redo** — a full undo/redo stack covers every pipeline operation (add, remove,
  reorder, edit step config). Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z.

### Step types

| Step | Description |
|------|-------------|
| WHERE | Filter rows by condition |
| SELECT | Choose columns, rename, computed columns (with column drag-reorder) |
| ORDER BY + LIMIT | Sort and paginate |
| GROUP BY + aggregations | Sum, count, avg, group by column |
| JOIN | Cross-table join (see JOIN modes below) |
| Raw SQL | Escape hatch — composes via CTE, see `docs/architecture.md` |

### JOIN modes

Three modes, available simultaneously — the user picks per JOIN step:

1. **Inline table picker** — linear step with a secondary "join with table X on Y = Z"
   config panel. The fastest path to a working JOIN; also the one that validates the CTE
   composition layer, so it shipped first.
2. **Branch input** — a Y-shape with left/right input slots merging into one output. Same
   underlying SQL logic as the inline picker, just a different (heavier) UI on top of it.
3. **Subpipeline** — nest a full pipeline as input to a JOIN step, enabling complex joins
   and subqueries. Genuinely different from the other two — needs nested pipeline state and
   recursive CTE logic, so it's the natural place to stop if time runs short.

### Generated SQL panel

User-configurable: pin it as a persistent panel (bottom or right) or use it as a toggle
drawer. Updates live as the pipeline is built, with a copy button. This is a deliberate,
core educational feature — users should always be able to see exactly what SQL their visual
pipeline produces. Nothing should happen "by magic."

## Result Table

- **Row rendering** — hard cap + "Load more" button at the bottom; total row count shown
  prominently.
- **Large dataset support** — currently tuned for large SQLite files via streaming result
  reads and conservative memory management; future providers may need different strategies.
- **Cell interactions:**
  - Click a cell → copy its value to clipboard
  - Row-end button → copy the whole row as JSON
  - Click a column header → add/toggle an ORDER BY step in the pipeline (server-side sort,
    cycles ASC → DESC → off)
  - FK cells get the same click-to-copy, plus a `→ table` chip on row hover that navigates
    to the referenced table, pre-filtered by that value

### FK reference navigation

- Redirect-style: the Browse view replaces its content with the referenced table, filtered
  by `WHERE ref_col = value`
- A breadcrumb trail at the top shows the navigation path, e.g. `orders › users [id = 2]`
- Clicking any breadcrumb entry restores that table + filter state

## Edit Mode (Transaction Mode)

A dedicated **"Edit" tab**, separate from "Browse"/"Query" — a strong, deliberate visual
signal that makes it impossible to accidentally start editing data.

- Edits are **staged**, never committed immediately
- A diff panel shows every pending change before anything is applied
- "Apply all" runs everything as a **single atomic SQL transaction**
- On constraint failure (FK violation, unique constraint, …): full rollback, with the
  offending row highlighted in the diff
- Supports INSERT, UPDATE, and DELETE
- SELECT → UPDATE/INSERT chains can be saved as reusable queries

This is staged + transactional + rollback-on-failure on purpose: Quarry is a tool people
trust with their data, and "almost applied" is not an acceptable state for that tool to
leave someone in.

## Saved Queries

- **Named, with variables** — queries can contain `:variable_name` placeholders
- **Auto-generated form** — Quarry scans for placeholders and renders an input form before
  running; no extra config needed at save time
- **Scope** — covers both SELECT pipelines and SELECT → UPDATE/INSERT chains

## Schema Browser (Sidebar)

In the current SQLite provider, the sidebar is multi-file aware: each `.db` file in the
workspace is a collapsible section, with its `ATTACH` alias shown next to the filename —
consistent with the file → table → columns → indexes nesting, and necessary so users can
connect the `alias.table` prefix they see in generated CTE SQL back to a concrete file.

| Info | When shown |
|------|-----------|
| Column names + types + nullable | Always, per table |
| Row count | Lazy-loaded on table expand (avoids running `COUNT(*)` on every table at open) |
| Indexes + foreign keys | Expandable sub-section per table |

## Session Persistence

On relaunch, Quarry restores the last-opened workspace and its relevant UI state. Today
that means the SQLite workspace shape: connected `.db` files and open query tabs with full
pipeline state, including partially-built pipelines. Implemented via debounced (500ms)
localStorage autosave.

## Export Formats

CSV, JSON (array of objects), SQL `INSERT` statements (for seeding test databases), and
Markdown tables (for docs/READMEs). Always operates on the full, uncapped result set.

## First Launch Experience

- **First run** (VS Code-style): left panel shows the Quarry logo, a welcome message, and a
  "Start interactive tutorial" button; the right area offers the current open actions for
  supported providers. Today that is "Open .db file" with an empty SQLite workspace state.
- **Subsequent runs**: a recent-items list, with provider-specific icons/metadata.
- **Interactive tutorial**: initially SQLite-focused — a short, auto-advancing guided
  overlay that walks through the core pipeline-builder flow using a bundled sample
  e-commerce SQLite database.

## Visual Design

- OS-aware dark/light mode by default (follows system setting), with a user override in
  settings
- Target aesthetic: a serious dev tool — think Linear, Warp (dark mode); clean and minimal
  in light mode

## Input Paradigm

GUI-first, with keyboard shortcuts as accelerators — everything should be clickable and
discoverable on its own. Cmd+Enter to run, Cmd+S to save, Cmd+Z to undo.
