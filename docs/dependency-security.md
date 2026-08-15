# Dependency security

Quarry treats the lockfiles as release inputs. JavaScript dependencies are installed with
Bun's frozen lockfile mode in CI and release workflows; Rust dependencies are resolved from
`src-tauri/Cargo.lock`.

## Automated gates

- `bun run audit:dependencies` blocks critical JavaScript advisories and reports packages with
  install scripts that require trust review.
- Pull requests run GitHub's dependency-review action.
- Dependabot checks both the root/landing Bun workspace and `src-tauri` Cargo dependencies weekly.
- High and critical advisories are reviewed whenever dependencies change. A high advisory may
  remain temporarily only when the affected package is a build-only or optional dependency and
  the remediation is tracked here or in `docs/TODO.md`.

The critical gate is intentionally stricter than a blanket `bun audit --audit-level=high` gate:
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
