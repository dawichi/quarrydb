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

On macOS, this helper switches to Docker's `default` context, tries to launch Docker
Desktop if needed, and waits briefly for the daemon before failing.

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

### Manual Quarry Test Flow

1. Start the local services:

```bash
bun run dev:services:up
```

2. Start Quarry:

```bash
bun run tauri dev
```

3. In the welcome screen, open the MySQL provider card.
4. Save a MySQL profile with:
   - name: anything you want, for example `Local MySQL`
   - host: `127.0.0.1`
   - port: `3306`
   - username: `root`
   - password: `quarry`
   - default database: `quarry_demo`
5. Click `Use profile`.
6. In the pending connection target panel, re-enter the connection password if needed.
7. Click `Test MySQL connection`.
8. Once the MySQL workspace opens, click `Load sample data into quarry_demo`.
9. Browse the generated `products`, `customers`, `orders`, and `order_items` tables.
10. Use the `query` tab to run raw SQL against the sample schema.

Notes:

- Passwords are intentionally kept in runtime memory only for the current app run.
- Recent-item reopen and session restore require re-entering the MySQL password.
- Sample loading is idempotent for practical testing: if `products` already contains rows,
  Quarry leaves the existing sample tables alone.

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
- Docker stayed as developer tooling only. Quarry does not provision Docker containers for
  end users.
- Quarry now seeds MySQL sample tables on demand from inside the connected MySQL workspace
  instead of auto-populating the container at startup.
