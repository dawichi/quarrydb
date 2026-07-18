#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local-test-services.yml"
CURRENT_USER="$(id -un)"

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker CLI is not installed."
    exit 1
fi

CURRENT_CONTEXT="$(docker context show 2>/dev/null || true)"
if [[ "$CURRENT_CONTEXT" != "default" ]]; then
    docker context use default >/dev/null 2>&1 || true
fi

detect_foreign_docker_processes() {
    if [[ "$(uname -s)" != "Darwin" ]]; then
        return 1
    fi

    local output
    output="$(
        ps -axo user=,pid=,command= |
            awk -v current_user="$CURRENT_USER" '
                /Docker\.app/ && /\/Users\// {
                    if ($1 != current_user) {
                        print $0
                    }
                }
            '
    )"

    if [[ -n "$output" ]]; then
        printf '%s\n' "$output"
        return 0
    fi

    return 1
}

print_foreign_docker_process_message() {
    local foreign_processes="$1"
    echo "Docker Desktop is blocked by lingering processes from another macOS user session."
    echo "Current user: $CURRENT_USER"
    echo
    echo "Conflicting processes:"
    printf '%s\n' "$foreign_processes"
    echo
    echo "Quit Docker Desktop in that other macOS session or reboot, then retry:"
    echo "  bun run dev:services:up"
}

if ! docker info >/dev/null 2>&1; then
    if foreign_processes="$(detect_foreign_docker_processes)"; then
        print_foreign_docker_process_message "$foreign_processes"
        exit 1
    fi

    if [[ "$(uname -s)" == "Darwin" ]]; then
        open -a Docker >/dev/null 2>&1 || true
    fi

    echo "Waiting for Docker daemon..."
    for _ in {1..24}; do
        if docker info >/dev/null 2>&1; then
            break
        fi

        if foreign_processes="$(detect_foreign_docker_processes)"; then
            echo
            print_foreign_docker_process_message "$foreign_processes"
            exit 1
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
