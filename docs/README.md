# Quarry docs

Start with [AGENTS.md](AGENTS.md).

| File | What it covers |
|------|---------------|
| [AGENTS.md](AGENTS.md) | Working rules for contributors and AI agents |
| [roadmap.md](roadmap.md) | What Quarry is for, what's next, what's out of scope |
| [architecture.md](architecture.md) | Pipeline compiler, native SQL layer, providers, release pipeline |
| [product-spec.md](product-spec.md) | User-facing behavior of each feature |
| [testing.md](testing.md) | Test commands and what each layer proves |
| [release.md](release.md) | How to cut a release, including the manual smoke test |
| [release-notes-0.2.1.md](release-notes-0.2.1.md) | Notes for the current release |
| [dependency-security.md](dependency-security.md) | Audit gates and how advisories are accepted |
| [recovery-runbook.md](recovery-runbook.md) | Data ownership; exports are not backups |
| [local-test-services.md](local-test-services.md) | Docker MySQL/Redis for local testing |
| [adr/](adr/README.md) | Durable decisions ([0001](adr/0001-trust-boundaries-and-provider-data.md) trust boundaries, [0002](adr/0002-native-sql-and-pipeline-compiler.md) native SQL and compiler) |
| [conventions/](conventions/) | [Angular](conventions/angular-standalone.md), [naming](conventions/component-naming.md), [structure](conventions/component-structure.md), [TypeScript](conventions/typescript-strict.md), [styling](conventions/styling.md), [shared package](conventions/shared-package-structure.md) |

Finished plans and status logs from earlier phases live in git history (before commit
`docs: rewrite around the shipped product`).
