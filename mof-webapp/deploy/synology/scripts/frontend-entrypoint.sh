#!/bin/sh
set -eu

git-sync

app_dir="${REPO_DIR:-/workspace/repository}/mof-webapp/frontend"
cd "$app_dir"

npm ci --prefer-offline --no-audit --no-fund
npm run build

rm -rf /usr/share/nginx/html/*
cp -a dist/. /usr/share/nginx/html/
cp nginx.conf /etc/nginx/http.d/default.conf

exec nginx -g 'daemon off;'
