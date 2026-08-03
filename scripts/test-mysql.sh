#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local-test-services.yml"

bun run dev:services:up
cleanup() {
    docker compose -f "$COMPOSE_FILE" down >/dev/null 2>&1 || true
}
trap cleanup EXIT

for attempt in {1..30}; do
    if docker exec quarry-mysql mysqladmin ping -h localhost -uroot -pquarry --silent >/dev/null 2>&1; then
        break
    fi
    if [[ "$attempt" == 30 ]]; then
        echo "MySQL did not become ready in time." >&2
        exit 1
    fi
    sleep 2
done

QUARRY_MYSQL_INTEGRATION=1 bun run vitest run src/app/core/integration/mysql-provider.integration.spec.ts
