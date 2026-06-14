#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local-test-services.yml"

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker CLI is not installed."
    exit 1
fi

CURRENT_CONTEXT="$(docker context show 2>/dev/null || true)"
if [[ "$CURRENT_CONTEXT" != "default" ]]; then
    docker context use default >/dev/null 2>&1 || true
fi

if ! docker info >/dev/null 2>&1; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
        open -a Docker >/dev/null 2>&1 || true
    fi

    echo "Waiting for Docker daemon..."
    for _ in {1..24}; do
        if docker info >/dev/null 2>&1; then
            break
        fi
        sleep 5
    done
fi

if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not running."
    echo "Start Docker Desktop (or another local Docker daemon) and retry:"
    echo "  bun run dev:services:up"
    exit 1
fi

docker compose -f "$COMPOSE_FILE" up -d
