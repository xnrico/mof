#!/bin/sh
set -eu

PATH="/usr/local/bin:/var/packages/ContainerManager/target/usr/bin:$PATH"
export PATH

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker CLI was not found. Install Synology Container Manager." >&2
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "Cannot access the Docker daemon. On Synology, run this deployment command with sudo." >&2
    exit 1
fi

exec docker compose "$@"
