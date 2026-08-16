# Dependency security

Quarry treats the lockfiles as release inputs. JavaScript dependencies are installed with
Bun's frozen lockfile mode in CI and release workflows; Rust dependencies are resolved from
`src-tauri/Cargo.lock`.

## Automated gates

- `bun run audit:dependencies` blocks critical JavaScript advisories and reports packages with
  install scripts that require trust review.
- CI installs the pinned Rust toolchain and runs `cargo audit` against `src-tauri/Cargo.lock`.
  `bun run audit:rust` is the matching local command.
- Pull requests run GitHub's dependency-review action.
- Dependabot checks both the root/landing Bun workspace and `src-tauri` Cargo dependencies weekly.
- High and critical advisories are reviewed whenever dependencies change. A high advisory may
  remain temporarily only when the affected package is a build-only or optional dependency and
  the remediation is tracked here or in `docs/TODO.md`.

The critical JavaScript gate is intentionally stricter than a blanket `bun audit --audit-level=high` gate:
the current Astro toolchain still brings optional `sharp` and a few build-chain advisories that
cannot be upgraded independently without changing the supported toolchain. The currently
remaining high findings should be rechecked with `bun audit --audit-level=high` before each
release and removed as upstream compatible versions become available.

## Maintainer response

1. Run `bun audit` and identify whether the advisory is in shipped runtime code, the landing
   build, test-only code, or an optional platform package.
2. Prefer a normal compatible update. Use an `overrides` entry only for a compatible patched
   transitive release, and verify `bun run check:ci`, tests, and both builds.
3. For a finding that cannot be upgraded safely, record the package path, severity, affected
   surface, mitigation, and removal condition in the next release notes or this document.
4. Never bypass the critical gate or commit a lockfile change without reviewing its scripts and
   license/source changes.

## Current RustSec exceptions

The Rust audit gate currently ignores six indirect advisories that are locked by Tauri/SQLx
platform dependencies and cannot be removed by Quarry without changing those upstream stacks:

- `RUSTSEC-2026-0194` and `RUSTSEC-2026-0195` — `quick-xml` through Tauri's macOS plist tooling;
  the fixed release is not accepted by the currently locked `plist` requirement.
- `RUSTSEC-2026-0235` — `rkyv` on a target-specific transitive path.
- `RUSTSEC-2023-0071` — `rsa` through SQLx MySQL authentication; RustSec lists no fixed release.
- `RUSTSEC-2026-0190` and `RUSTSEC-2026-0221` — indirect `anyhow`/`event-listener` advisories
  owned by the Tauri/SQLx dependency graph.
- `RUSTSEC-2024-0429` — `glib` through Tauri's GTK3 platform dependency; it is retained only
  for the Linux/native dependency graph and is not used by the macOS/Windows release targets.

These are explicit, reviewable exceptions rather than a disabled scanner. The command remains
fail-closed for every other vulnerability; revisit each ignore when Tauri, SQLx, or the affected
crate publishes a compatible remediation.

The current audit also reports 17 allowed non-vulnerability warnings. Ten are unmaintained GTK3
bindings (`RUSTSEC-2024-0411` through `RUSTSEC-2024-0420`, excluding IDs not associated with the
GTK3 crates), five are unmaintained Unicode crates (`RUSTSEC-2025-0075`, `RUSTSEC-2025-0080`,
`RUSTSEC-2025-0081`, `RUSTSEC-2025-0098`, and `RUSTSEC-2025-0100`), one is the unmaintained
`proc-macro-error` crate (`RUSTSEC-2024-0370`), and one is the yanked `spin` release. They are
transitive platform/tooling dependencies in the current Tauri graph; the audit command reports
them without suppressing them. Revisit them when the upstream graph offers compatible replacements
or when the supported native target set changes.
