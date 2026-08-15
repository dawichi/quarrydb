# Quarry landing site

The public Astro landing page for [quarrydb.app](https://quarrydb.app). It contains the
marketing page, interactive pipeline demo, and release download links.

## Project structure

```text
landing/
├── public/              # favicon and static assets
├── src/pages/index.astro
├── src/lib/releases.ts  # GitHub release metadata boundary
└── src/styles/global.css
```

## Commands

Run these commands from the repository root:

| Command | Purpose |
|---|---|
| `bun install --frozen-lockfile` | Install the workspace dependencies |
| `bun --cwd landing run dev` | Start the Astro dev server |
| `bun run build:landing` | Build the production landing site |
| `bun --cwd landing run preview` | Preview the production build |

The landing page is static-first. Client-side JavaScript is limited to the interactive
pipeline demo and fetching the latest public GitHub release metadata.
