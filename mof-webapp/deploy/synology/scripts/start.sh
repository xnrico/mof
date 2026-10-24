#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
deployment_dir="$(dirname "$script_dir")"
cd "$deployment_dir"

for required_file in .env config/backend.env secrets/github_pat.txt; do
    if [ ! -s "$required_file" ]; then
        echo "Missing required file: $deployment_dir/$required_file" >&2
        exit 1
    fi
done

chmod 600 .env config/backend.env secrets/github_pat.txt
mkdir -p data/postgres runtime/backend-repository runtime/frontend-repository backups

"$script_dir/docker-compose.sh" up -d --build --remove-orphans
"$script_dir/docker-compose.sh" ps
