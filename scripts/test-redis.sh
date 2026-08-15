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
    if docker exec quarry-redis redis-cli ping 2>/dev/null | rg -q '^PONG$'; then
        break
    fi
    if [[ "$attempt" == 30 ]]; then
        echo "Redis did not become ready in time." >&2
        exit 1
    fi
    sleep 2
done

(cd "$ROOT_DIR/src-tauri" && QUARRY_REDIS_INTEGRATION=1 cargo test exercises_the_native_provider_against_a_live_server_when_requested)
