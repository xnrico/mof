#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 backups/mof-TIMESTAMP.dump" >&2
    exit 2
fi

dump_file="$1"
if [ ! -s "$dump_file" ]; then
    echo "Dump file does not exist or is empty: $dump_file" >&2
    exit 1
fi

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
compose="$script_dir/docker-compose.sh"
cd "$(dirname "$script_dir")"
mkdir -p data/postgres runtime/backend-repository runtime/frontend-repository backups

if [ ! -s .env ]; then
    echo "Missing required file: $(pwd)/.env" >&2
    exit 1
fi

set -a
. ./.env
set +a

: "${POSTGRES_USER:?Set POSTGRES_USER in .env}"
: "${POSTGRES_DB:?Set POSTGRES_DB in .env}"

"$compose" stop backend frontend >/dev/null 2>&1 || true
"$compose" up -d postgres

attempt=0
until "$compose" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        echo "PostgreSQL did not become ready" >&2
        exit 1
    fi
    sleep 2
done

"$compose" exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"
"$compose" exec -T postgres createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
"$compose" exec -T postgres pg_restore \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --exit-on-error \
    --no-owner \
    --no-privileges <"$dump_file"

"$compose" up -d backend frontend
"$compose" ps
