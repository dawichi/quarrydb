# Docker-Backed Sample Databases

This document scopes a "try it now" path for server-based providers (MySQL today;
Postgres/Redis/Mongo in Phase 5), written before any implementation starts.

## Goal

Give every server-based provider a one-click "give it a quick try with sample data"
option, similar in spirit to SQLite's "Create sample SQLite database" button — but using
Docker to stand up a short-lived, pre-seeded container instead of writing a local file.

If Docker is detected and running, the provider's connect screen offers an extra option
alongside "Connect to existing server":

> Want to give it a quick try? If you have Docker, we can spin up a local sample
> database for you.

Clicking it runs the engine's official image with the same sample dataset Quarry already
seeds for SQLite, waits for it to be healthy, and connects automatically.

## Why This, Why Now

SQLite's sample flow is trivial because SQLite is embedded — Quarry can materialize a
working database from nothing but a file path. MySQL, Postgres, Redis, and Mongo are all
servers; Quarry cannot materialize a server from nothing without bundling per-platform
binaries, which is explicitly out of scope (see `mysql-provider-plan.md` non-goals and
`roadmap.md`'s "do not abstract ahead of evidence").

Docker already solves "ship a database binary for every OS" — official images exist for
every engine on the roadmap, each supporting drop-in seed scripts
(`/docker-entrypoint-initdb.d` for MySQL/Postgres, init scripts/import for Mongo/Redis).
Building this now, while MySQL is the only server provider, is justified because:

- the expensive part (Docker detection, container lifecycle, shell-exec sandboxing) is
  the same regardless of engine
- the cheap part (which image, which seed, which port) is a small per-provider config
- doing the lifecycle/sandboxing work twice (once per future provider) would cost far
  more than factoring it out once, while MySQL is still the only consumer

This is the same "shared layer only when ≥2 providers truly need it" bar from
`provider-contract-plan.md` — here the *shared infrastructure* has exactly one consumer
today (MySQL), but its shape is dictated by lifecycle/security concerns that don't change
as Postgres/Redis/Mongo are added later, so designing it generically now avoids a rewrite
then.

## User Model / UX Sketch

- On a provider's connect screen (MySQL first), detect Docker availability on screen
  load. If unavailable, show nothing extra — the existing "connect to a server you run"
  flow is unaffected.
- If available, show "Try with Docker" as a secondary action next to the normal connect
  form.
- On click: run the provider's sample container, poll until healthy, build a connection
  profile pointing at `localhost:<allocated-port>`, and connect through the existing
  connection flow — no new connection-model concepts.
- The resulting profile/recent item is a normal MySQL (etc.) connection. It is tagged as
  Quarry-managed (e.g. `origin: 'docker-sample'`) so the UI can show a small badge and
  offer "Stop & remove sample container" from the recent-items list or connection
  settings.
- Sample containers are not started automatically on app launch and are not part of
  session restore — restoring a session for a docker-sample connection just attempts a
  normal connect, and fails with the normal "couldn't connect" error if the container
  isn't running. Re-creating it is a manual action.

## Shared Infrastructure Shape

- **`DockerSampleService`** (provider-agnostic): given a small per-provider config
  (image, internal port, env vars, seed mount, healthcheck command), can `run`, `stop`,
  `remove`, and report `status` for a container. Owns port allocation and health polling.
  Lives in `src/app/core/services/`, alongside other cross-provider services.
- **Per-provider config** (e.g. `mysql-sample-container.ts`): lives next to that
  provider's other definitions, not inside the shared service. Postgres/Redis/Mongo add
  their own config files only when those providers themselves are built — this plan does
  not pre-build configs for engines without a provider yet.
- **Seed data**: the MySQL sample reuses/adapts the existing e-commerce dataset from
  `sqlite-sample-database.service.ts` / `sample-schema.ts`, translated to MySQL DDL, so
  the "first thing you see" is the same shape across providers. Future providers do their
  own translation (e.g. Mongo collections, Redis keys) when they're built.

## Detection & Execution

- Requires adding `tauri-plugin-shell` (not currently installed), scoped to an explicit
  allowlist of `docker` subcommands only: `docker info`, `docker run`, `docker ps`,
  `docker inspect`, `docker stop`, `docker rm`. No general shell execution.
- All arguments are passed as argument arrays to the shell plugin, never interpolated
  into a shell string — this is new attack surface and must not become a command
  injection vector.
- macOS GUI apps don't inherit a shell `PATH`, so `docker` may not resolve even when
  installed (Docker Desktop, Homebrew). Detection must check common install locations
  (`/usr/local/bin/docker`, `/opt/homebrew/bin/docker`, Docker Desktop's CLI path) in
  addition to `PATH`.
- If `docker info` fails (not installed, or daemon not running), the "Try with Docker"
  option is hidden — this is a convenience, not a requirement, and must never block or
  degrade the normal connect flow.

## Non-Goals (v1)

- **Not a Docker management UI.** No image-pull progress, no multi-container
  orchestration, no Compose files, no arbitrary image selection.
- **Not required for any provider's core functionality.** Connecting to a real,
  user-managed server remains the primary, always-available path. Docker is purely an
  optional accelerator for a first try.
- **No persistence guarantees.** Sample containers are explicitly disposable. If a user
  wants to keep the data, that's a reason to connect to a real server/volume, not a
  reason to make sample containers durable.
- **Not bundling or installing Docker.** Quarry only detects and drives an existing
  Docker installation.
- **No pre-built configs for providers that don't exist yet.** Postgres/Redis/Mongo
  sample configs are added when those providers are built (Phase 5), not speculatively
  now.
- **No automatic cleanup on app exit.** Containers Quarry starts keep running until the
  user explicitly stops them (or stops Docker / their machine). Auto-cleanup-on-exit can
  be revisited if abandoned containers turn out to be a real problem.

## Build Order

1. Spike: `tauri-plugin-shell` integration + Docker detection (`docker info`), including
   macOS PATH-resolution fallbacks, with the command allowlist in place from the start.
2. `DockerSampleService`: run/stop/status for a single container from a config object;
   port allocation; health-check polling.
3. MySQL sample container config: official `mysql:8` image, seed SQL adapted from the
   SQLite sample dataset, mounted via `/docker-entrypoint-initdb.d`.
4. UI: "Try with Docker" option on the MySQL connect screen (gated on detection),
   auto-connect on success, Quarry-managed badge + "Stop & remove" action on the
   resulting recent item.
5. Defer Postgres/Redis/Mongo configs until those providers are actually being built.

## Related

- `mysql-provider-plan.md` — MySQL v1 scope; this plan's first consumer
- `multi-engine-architecture.md` — provider model this fits into
- `roadmap.md` — Phase 5 (additional providers)
- `provider-contract-plan.md` — "shared layer only when ≥2 providers need it" precedent
