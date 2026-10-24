#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$(dirname "$script_dir")"

"$script_dir/docker-compose.sh" restart backend frontend
"$script_dir/docker-compose.sh" ps
