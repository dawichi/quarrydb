# Post-MVP Scoping Notes

Short Goals/Non-goals notes for the three post-MVP features already named in the roadmap
(`docs/status.md`), written *before* starting any of them.

The point of writing down Non-goals isn't pessimism — it's preventing the most likely
failure mode for each of these specific features: starting from "let's add JOIN branch
mode" or "let's support encryption" and quietly ballooning into a much bigger rewrite
mid-build, because nobody wrote down what v1 deliberately leaves out. If you start one of
these features and find yourself solving something in its Non-goals list, that's a signal
to stop and either cut scope back to what's written here, or update this doc *first* and
explain why the scope changed.

---

## JOIN: Branch Input Mode

**Goal:** Give JOIN steps a second visual representation — a Y-shape with left/right input
slots merging into one output — as an alternative to the existing inline table picker.
Users pick whichever mode fits how they think about a given join.

This is explicitly a *visual* upgrade on top of already-working logic: the inline picker
already validates the CTE composition layer (it shipped first for exactly that reason), and
branch mode reuses that same SQL generation. Per the original build-order analysis, this is
roughly a 70% visual refactor of working code, not new query logic.

**Non-goals (v1):**
- **No new SQL/CTE compilation logic.** Branch mode produces the exact same generated SQL
  as the inline picker for an equivalent join — it's a different way to *configure* the
  same operation, not a different operation.
- **No more than two input branches.** A JOIN step has one left input and one right input.
  Multi-way joins remain expressed as chained JOIN steps, same as today.
- **No drag-to-rewire of branch connections mid-build.** v1 is: pick the left source, pick
  the right source, configure the join condition. Live re-routing of an existing branch
  connection is a later refinement, not a launch requirement.
- **Not a replacement for the inline picker.** Both modes coexist permanently — this is
  additive, not a migration.

---

## JOIN: Subpipeline Mode

**Goal:** Let a JOIN step take a full nested pipeline as its input, instead of a plain
table — enabling derived-table-style joins and genuinely complex queries without leaving
the visual builder. This is the mode flagged from the start as "a genuinely different
beast… v2 candidate if time runs short," because it needs nested pipeline state and
recursive CTE logic that neither of the other two modes touches.

**Non-goals (v1):**
- **No arbitrary nesting depth.** A subpipeline may itself contain a JOIN step, but that
  inner JOIN step may **not** be in subpipeline mode. One level of subpipeline nesting is
  the v1 ceiling — deeper nesting is a v2-or-later concern, revisit only if real usage
  demands it.
- **No recursive or self-referential subpipelines** (a subpipeline that joins against the
  table its parent pipeline is already operating on, recursive-CTE style). That's a
  meaningfully different feature (recursive CTEs), not a natural extension of this one.
- **No cross-JOIN-step subpipeline reuse.** Each subpipeline lives inside its own JOIN
  step. "Save this subpipeline and reuse it in another JOIN" is explicitly out of scope —
  if that need shows up later, it likely means subpipelines should become a kind of saved
  query, which is a different design conversation.
- **No live per-step preview inside the nested pipeline.** The outer pipeline keeps its
  existing live-preview behavior; the subpipeline only needs to show its final output
  feeding into the JOIN. Full nested live-preview is a nice-to-have, not a requirement.

---

## Encrypted SQLite (SQLCipher)

**Goal:** Let users open and create password-protected `.db` files, by swapping the app's
`rusqlite` for a SQLCipher-enabled build. This was already noted as not requiring
architectural changes — the data-access path through `tauri-plugin-sql` stays the same;
only the underlying SQLite build changes.

**Non-goals (v1):**
- **Not encrypting Quarry's own local data** — workspace config, session persistence,
  saved queries, query history all stay as they are today (localStorage / app data folder).
  Scope is strictly user-supplied `.db` files.
- **No in-place migration of existing unencrypted databases.** v1 is: open an
  already-encrypted file (with a password prompt), or create a new encrypted file. Turning
  an existing plain `.db` into an encrypted one is separate tooling for a later release.
- **No multi-user key management** — no key sharing, key rotation, or per-user
  permissions. One password per file, entered locally, full stop.
- **Not being built speculatively.** Per the existing roadmap note: defer starting this
  until a real user actually asks for it. Writing this scoping note now is preparation, not
  a signal to start.

---

## Related

- `docs/product-spec.md` — current (shipped) JOIN modes and pipeline interaction model
- `docs/status.md` — roadmap entries for these three features
