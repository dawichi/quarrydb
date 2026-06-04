# Quarry — AI & Developer Reference

This folder contains coding conventions and guidelines for the Quarry project.
Any AI agent working on this codebase should read these files at the start of each session.

## Project Context

Full project spec, design decisions, and milestone log live in the notes vault:
`/Users/dawichi/Documents/dawichi-notes/journal/github/projects/quarry.md`
(on David's machine — teammates should ask David for the equivalent reference)

## Convention Files

| File | What it covers |
|------|---------------|
| [conventions/angular-standalone.md](conventions/angular-standalone.md) | Standalone components, new control flow syntax, Signals, inject() |
| [conventions/component-naming.md](conventions/component-naming.md) | File naming, selector naming, directory structure |
| [conventions/component-structure.md](conventions/component-structure.md) | Section separators, visibility modifiers, component size |
| [conventions/typescript-strict.md](conventions/typescript-strict.md) | No `any`, explicit types, type imports |
| [conventions/styling.md](conventions/styling.md) | Tailwind-first, when SCSS is allowed |

## Quick Rules

- All components are standalone — no NgModules
- Angular Signals for state — no NgRx
- `inject()` syntax — no constructor injection
- Tailwind CSS for all styling — SCSS only for keyframes/animations
- Biome for linting and formatting (`bun run check`)
- No `any` types without a TODO comment
