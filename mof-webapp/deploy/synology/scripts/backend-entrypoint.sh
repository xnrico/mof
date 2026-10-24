#!/bin/sh
set -eu

git-sync

app_dir="${REPO_DIR:-/workspace/repository}/mof-webapp/backend"
requirements_file="$app_dir/requirements.txt"
requirements_hash="$(sha256sum "$requirements_file" | cut -d ' ' -f 1)"

if [ ! -x /venv/bin/python ] || [ ! -f /venv/.requirements-hash ] || [ "$(cat /venv/.requirements-hash)" != "$requirements_hash" ]; then
    python -m venv /venv
    /venv/bin/pip install --upgrade pip
    /venv/bin/pip install --requirement "$requirements_file"
    printf '%s\n' "$requirements_hash" > /venv/.requirements-hash
fi

cd "$app_dir"
exec /venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
