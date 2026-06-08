# Roadmap

This is the long-term map for Quarry — where `status.md` tracks "what's done and what's
next," this file answers "what is this project trying to become, and in what order."

## Long-Term Vision

Replace the patchwork of database tools with one centralized app that has better UI/UX
than any of them — starting with MySQL Workbench (work use) and DB Browser for SQLite
(personal use), and potentially expanding from there.

The path there is deliberately staged: go all-in on SQLite first — build the single best
local SQLite tool that exists — and only then generalize to other engines. Trying to
abstract across engines too early would compromise the thing that makes Quarry worth
using: a UI that feels designed around how a specific engine actually works, not a
lowest-common-denominator wrapper.

## Phases

These are *generic checkpoints*, not dated milestones — each one is a long stretch of
work in its own right, refined as we go. See `status.md` for the concrete, current-state
roadmap within whichever phase is active.

### Phase 1 — SQLite-complete

The bar: nothing should force a user back to DB Browser for SQLite. That means going
beyond "browse, query, edit rows" (already shipped) into the things a power user actually
needs day to day:

- **Schema management (DDL)** — create/alter/drop tables, columns, indexes, views,
  triggers. See `schema-management-plan.md` — this is the current focus.
- **JOIN: branch & subpipeline modes** — see `post-mvp-scoping.md`
- Other SQLite-specific power tools as they prove necessary: `VACUUM` / integrity checks,
  attaching multiple databases, full-text search (FTS5), etc. — added to this list only
  once a real workflow needs them, not speculatively.
- **Encrypted SQLite (SQLCipher)** — see `post-mvp-scoping.md`

### Phase 2 — Production-grade polish

The things that separate "a fun side project" from "a tool I trust with my actual data
every day":

- Cross-platform parity (Windows menu bar verification, etc.)
- Full E2E coverage of golden-path flows (Playwright)
- Performance at scale — large databases, wide tables, big result sets
- Code signing (Apple notarization, Windows EV cert) — see
  `architecture.md#known-platform-issues`

### Phase 3 — Multi-engine expansion

Once Quarry is genuinely excellent at SQLite, generalize outward — starting with MySQL
(the most direct MySQL Workbench replacement need), then potentially Postgres, MongoDB,
etc.

This phase is the one that actually changes the architecture: today everything assumes
`tauri-plugin-sql` + SQLite (see `architecture.md`). Supporting another engine — especially
a non-SQL one like MongoDB — means designing a real data-access abstraction layer, which
doesn't exist yet and shouldn't be built before it's needed.

## Related

- `status.md` — current implementation status, near-term roadmap, milestone log
- `schema-management-plan.md` — build-order plan for DDL support (current focus)
- `post-mvp-scoping.md` — Goals/Non-goals notes for JOIN modes and SQLCipher
