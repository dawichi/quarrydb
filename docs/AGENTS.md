# Quarry Agent Instructions

The canonical instructions for AI agents and contributors. The root
[`AGENTS.md`](../AGENTS.md) redirects here.

## What Quarry is

A desktop app that helps programmers see what a query does: a query is a chain of visual
blocks, each showing its rows, with the SQL always visible. SQLite and MySQL run the pipeline;
Redis has a separate key browser. Read [roadmap.md](roadmap.md) before proposing features. The
pipeline comes first, and new engines are out of scope.

## Read before changing code

- [architecture.md](architecture.md) for how the pipeline compiler, native SQL layer and providers fit.
- [testing.md](testing.md) for what each test layer proves.
- [product-spec.md](product-spec.md) for user-facing behavior.
- [conventions/](conventions/) for Angular, TypeScript and styling rules.
- [adr/](adr/) for durable decisions.

The code is the source of truth. When a doc disagrees with it, fix the doc in the same change.

## Working rules

- **Done means tested.** A change is finished when a test that would fail without it passes.
  Never write "verified", "passes" or "enforced" in docs or notes without a run that shows it.
- **Prefer shipping over planning.** Don't add planning documents, checklists or standards
  files. A short goal/non-goal note in the PR is enough.
- **Pipeline SQL goes through the compiler.** Never build pipeline SQL by string concatenation
  elsewhere. Values are bound parameters; identifiers go through `quoteIdentifier`.
- **Database access goes through `core/native/sql-client.ts`.** New SQL capabilities are Rust
  commands in `src-tauri/src/sql` with a test, plus an IPC test when arguments change.
- **Keep the provider boundary.** Redis is not forced through SQL abstractions. A new SQL engine
  needs a native driver and a `PipelineBackend`, not a new pipeline UI.
- **Protect user data.** Staged edits stay transactional; destructive actions need confirmation;
  never reset, seed or rewrite a user's database without an explicit action.
- **Keep secrets out.** No credentials in profiles, sessions, history, logs, diagnostics or
  tests; remembered passwords live only in the OS keyring.
- No telemetry, accounts or network requirements in the local-first core.

## Verify

```bash
bun run check && bun run test:run && bun run test:e2e && bun run build
(cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings && cargo fmt --check)
bun run test:mysql   # with Docker
```

Always use Bun (`bun install`, `bun run`, `bunx`), never npm/npx/yarn. Do not commit `dist/` or
`src/styles.css`.
