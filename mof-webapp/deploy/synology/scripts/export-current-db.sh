#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
deployment_dir="$(dirname "$script_dir")"
compose="$script_dir/docker-compose.sh"
source_compose_dir="${1:-$(CDPATH= cd -- "$deployment_dir/../.." && pwd)}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output_file="$deployment_dir/backups/mof-$timestamp.dump"

mkdir -p "$deployment_dir/backups"
cd "$source_compose_dir"

"$compose" up -d postgres

attempt=0
until "$compose" exec -T postgres pg_isready -U mof -d mof >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        echo "PostgreSQL did not become ready" >&2
        exit 1
    fi
    sleep 2
done

"$compose" exec -T postgres pg_dump -U mof -d mof --format=custom --no-owner --no-privileges >"$output_file"

if [ ! -s "$output_file" ]; then
    echo "Database export is empty" >&2
    exit 1
fi

chmod 600 "$output_file"
echo "$output_file"
