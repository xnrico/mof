#!/bin/sh
set -eu

: "${GIT_REPOSITORY:?GIT_REPOSITORY is required}"
: "${GIT_BRANCH:=main}"
: "${GIT_USERNAME:=x-access-token}"
: "${GIT_PAT_FILE:=/run/secrets/github_pat}"
: "${REPO_DIR:=/workspace/repository}"

if [ ! -s "$GIT_PAT_FILE" ]; then
    echo "GitHub PAT secret is missing or empty: $GIT_PAT_FILE" >&2
    exit 1
fi

askpass_file="$(mktemp)"
cleanup() {
    rm -f "$askpass_file"
}
trap cleanup EXIT HUP INT TERM

cat >"$askpass_file" <<'EOF'
#!/bin/sh
case "$1" in
    *Username*) printf '%s\n' "${GIT_USERNAME:-x-access-token}" ;;
    *Password*) cat "${GIT_PAT_FILE:-/run/secrets/github_pat}" ;;
    *) exit 1 ;;
esac
EOF
chmod 700 "$askpass_file"

export GIT_ASKPASS="$askpass_file"
export GIT_TERMINAL_PROMPT=0

if ! git config --global --get-all safe.directory 2>/dev/null | grep -Fx "$REPO_DIR" >/dev/null; then
    git config --global --add safe.directory "$REPO_DIR"
fi

if [ ! -d "$REPO_DIR/.git" ]; then
    mkdir -p "$REPO_DIR"
    find "$REPO_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    git clone --single-branch --branch "$GIT_BRANCH" "$GIT_REPOSITORY" "$REPO_DIR"
else
    git -C "$REPO_DIR" remote set-url origin "$GIT_REPOSITORY"
    git -C "$REPO_DIR" fetch --prune origin "$GIT_BRANCH"
    git -C "$REPO_DIR" checkout -B "$GIT_BRANCH" "origin/$GIT_BRANCH"
    git -C "$REPO_DIR" reset --hard "origin/$GIT_BRANCH"
    git -C "$REPO_DIR" clean -ffd
fi

checked_out_commit="$(git -C "$REPO_DIR" rev-parse --short HEAD)"
echo "Checked out $checked_out_commit from $GIT_BRANCH"
