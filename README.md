<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Quarry logo" width="96" />
</p>

<h1 align="center">Quarry</h1>

<p align="center">
  See what your query does, one step at a time.<br/>
  Build SQL as a chain of visual blocks — like <code>.filter().map()</code> — and watch the rows change at every step.
</p>

---

## What it does

Quarry is a desktop app for SQLite and MySQL. Pick a table, then stack blocks: filter, select,
sort, group, join. Every block shows the rows it produces and how many there are, and the SQL
behind the whole chain is always on screen. It's built for understanding queries, whether you
are learning SQL, debugging one, or explaining one to a teammate.

```
orders                          1,204 rows
 └─ WHERE total > :min           312 rows
     └─ JOIN customers           312 rows   (+ customers_id, name, country)
         └─ GROUP BY country       9 rows   (country, revenue)
```

Around the pipeline: a table browser, staged edits that apply as one transaction, SQLite schema
tools, exports (CSV, JSON, SQL, Markdown) and a Redis/Valkey key browser.

## Running it

**Prerequisites:** Rust, Bun, and the [Tauri v2 prerequisites](https://tauri.app/start/prerequisites/).

```bash
bun install
bun run tauri dev      # desktop app with hot reload
bun run tauri build    # installers
bun run start          # Angular UI only, in the browser (no database access)
```

Local MySQL and Redis for development: `bun run dev:services:up`
(see [docs/local-test-services.md](docs/local-test-services.md)).

## Testing

```bash
bun run qa           # lint, unit/integration, browser and landing tests, builds
bun run test:mysql   # live MySQL suites in Docker
(cd src-tauri && cargo test)
```

See [docs/testing.md](docs/testing.md) for what each layer proves.

## How it's built

| Layer | Choice |
|-------|--------|
| Shell | Tauri 2 (Rust) |
| UI | Angular 22, Signals, Tailwind CSS v4 |
| Database access | `sqlx` in Rust (SQLite, MySQL); `redis` crate for Redis/Valkey |
| Pipeline compiler | TypeScript, `packages/shared/src/pipeline-sql.ts` |
| Tooling | Bun, Biome, Vitest, Playwright, cargo test |
| Landing | Astro ([quarrydb.app](https://quarrydb.app)) |

```
src/                 Angular app
src-tauri/           Rust shell: native SQL, Redis, keyring, menus, updater
packages/shared/     Pipeline model and SQL compiler (shared with the landing demo)
landing/             Astro site
docs/                Architecture, roadmap, testing, releases
```

Start with [docs/architecture.md](docs/architecture.md) and [docs/roadmap.md](docs/roadmap.md).

## License

MIT
