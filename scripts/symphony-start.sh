#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SYMPHONY_HOME="${SYMPHONY_HOME:-$ROOT_DIR/.tools/symphony}"
WORKFLOW_PATH="${SYMPHONY_WORKFLOW_PATH:-$ROOT_DIR/WORKFLOW.md}"
BOOTSTRAP_SCRIPT="$ROOT_DIR/scripts/symphony-bootstrap.sh"

export SOURCE_REPO_PATH="${SOURCE_REPO_PATH:-$ROOT_DIR}"

if [ ! -f "$WORKFLOW_PATH" ]; then
  echo "Workflow file not found: $WORKFLOW_PATH" >&2
  exit 1
fi

if [ ! -x "$SYMPHONY_HOME/elixir/bin/symphony" ]; then
  "$BOOTSTRAP_SCRIPT"
fi

cd "$SYMPHONY_HOME/elixir"

if [ "$#" -eq 0 ]; then
  set -- \
    --i-understand-that-this-will-be-running-without-the-usual-guardrails \
    "$WORKFLOW_PATH"
else
  set -- \
    --i-understand-that-this-will-be-running-without-the-usual-guardrails \
    "$@" \
    "$WORKFLOW_PATH"
fi

if command -v mise >/dev/null 2>&1; then
  exec mise exec -- ./bin/symphony "$@"
fi

exec ./bin/symphony "$@"
