#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
deployment_dir="$(dirname "$script_dir")"
pat_file="$deployment_dir/secrets/github_pat.txt"

printf 'Fine-grained GitHub PAT: ' >&2
stty -echo
trap 'stty echo' EXIT HUP INT TERM
IFS= read -r github_pat
stty echo
trap - EXIT HUP INT TERM
printf '\n' >&2

if [ -z "$github_pat" ]; then
    echo "PAT cannot be empty" >&2
    exit 1
fi

umask 077
printf '%s' "$github_pat" >"$pat_file"
unset github_pat
echo "Saved PAT to $pat_file"
