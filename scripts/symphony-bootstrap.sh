#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SYMPHONY_HOME="${SYMPHONY_HOME:-$ROOT_DIR/.tools/symphony}"
SYMPHONY_REPO_URL="${SYMPHONY_REPO_URL:-https://github.com/openai/symphony.git}"
SYMPHONY_PATCH_FILE="${SYMPHONY_PATCH_FILE:-$ROOT_DIR/patches/symphony-local.patch}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not installed." >&2
  exit 1
fi

if ! command -v mise >/dev/null 2>&1; then
  echo "mise is required. Install it from https://mise.jdx.dev/ and run again." >&2
  exit 1
fi

mkdir -p "$(dirname "$SYMPHONY_HOME")"

if [ -d "$SYMPHONY_HOME/.git" ]; then
  git -C "$SYMPHONY_HOME" fetch origin main
  git -C "$SYMPHONY_HOME" checkout main
  git -C "$SYMPHONY_HOME" pull --ff-only origin main
else
  git clone --depth 1 "$SYMPHONY_REPO_URL" "$SYMPHONY_HOME"
fi

if [ -f "$SYMPHONY_PATCH_FILE" ]; then
  if git -C "$SYMPHONY_HOME" apply --reverse --check "$SYMPHONY_PATCH_FILE" >/dev/null 2>&1; then
    echo "Local Symphony patch already applied: $SYMPHONY_PATCH_FILE"
  else
    git -C "$SYMPHONY_HOME" apply "$SYMPHONY_PATCH_FILE"
    echo "Applied local Symphony patch: $SYMPHONY_PATCH_FILE"
  fi
fi

cd "$SYMPHONY_HOME/elixir"
mise trust
mise install
mise exec -- mix setup
mise exec -- mix build

echo "Symphony is ready in $SYMPHONY_HOME/elixir"
