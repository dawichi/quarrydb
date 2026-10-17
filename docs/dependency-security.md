# Dependency security

Lockfiles are release inputs: CI installs with `bun install --frozen-lockfile` and builds from
`src-tauri/Cargo.lock`. Dependabot proposes weekly updates for both ecosystems.

## Gates

`bun run audit:dependencies` runs in CI and fails on:

- critical JavaScript advisories (`bun audit --audit-level=critical`) and untrusted install
  scripts (`bun pm untrusted`);
- any Rust vulnerability or unsound-code advisory not listed in
  [`src-tauri/.cargo/audit.toml`](../src-tauri/.cargo/audit.toml). "Unmaintained" warnings are
  reported but do not fail.

## Accepting an advisory

Only when no compatible fix exists. Add it to `src-tauri/.cargo/audit.toml` with a comment
that says why Quarry is not exposed (or how it is mitigated) and when to remove it. That file
is the single list; CI, the release workflow and `bun run audit:rust` all read it.

For JavaScript, prefer a normal update; use an `overrides` entry in `package.json` only to
force a compatible patched transitive version, then run the full QA.

## When an advisory appears

1. Find the path: `cargo tree -i <crate>` or `bun pm why <package>`.
2. Try `cargo update` / `bun update` and rerun the tests.
3. If it still cannot be fixed, accept it as above in the same PR that unblocks CI.
