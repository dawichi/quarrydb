# Local Test Services

This is an optional developer convenience for manually testing Quarry against local
server databases during provider work.

It is **not** part of Quarry's product scope. Quarry does not manage Docker containers or
provision sample servers for users. These steps are only for local development.

## Why This Exists

SQLite testing is easy because Quarry can create a local `.db` file directly. Server
providers such as MySQL, Postgres, and Redis need something running first.

For development, the fastest path is usually a disposable Docker container.

## Quick Start

```bash
bun run dev:services:up
```

Stop everything:

```bash
bun run dev:services:down
```

Follow container logs:

```bash
bun run dev:services:logs
```

The compose file lives at
[`docker-compose.local-test-services.yml`](../docker-compose.local-test-services.yml).

## MySQL

Connection settings:

- host: `127.0.0.1`
- port: `3306`
- user: `root`
- password: `quarry`
- default schema: `quarry_demo`
- after connecting in Quarry, use `Load sample data into quarry_demo` in the MySQL workspace
  to create and seed `products`, `customers`, `orders`, and `order_items`

## Postgres

Connection settings:

- host: `127.0.0.1`
- port: `5432`
- user: `postgres`
- password: `quarry`
- database: `quarry_demo`

## Redis

Connection settings:

- host: `127.0.0.1`
- port: `6379`

## Notes

- Change host ports if you already have local services running.
- These containers are intentionally disposable.
- Quarry now seeds MySQL sample tables on demand from inside the connected MySQL workspace,
  rather than auto-populating the Docker container at startup.
