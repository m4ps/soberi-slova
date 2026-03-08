#!/usr/bin/env bash
set -euo pipefail

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is missing: $1" >&2
    exit 1
  fi
}

linear_graphql() {
  local payload="$1"

  curl -fsS https://api.linear.app/graphql \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    --data "$payload"
}

build_linear_issue_query() {
  ISSUE_IDENTIFIER="$1" python3 - <<'PY'
import json
import os

print(json.dumps({
    "query": """
query GetIssue($id: String!) {
  issue(id: $id) {
    id
    identifier
    title
    url
    state {
      name
    }
    labels {
      nodes {
        name
      }
    }
  }
}
""",
    "variables": {
        "id": os.environ["ISSUE_IDENTIFIER"],
    },
}))
PY
}

parse_linear_issue() {
  python3 -c '
import json
import shlex
import sys

payload = json.load(sys.stdin)
issue = ((payload.get("data") or {}).get("issue"))
if not issue:
    raise SystemExit("Linear issue lookup failed")

labels = [
    ((node or {}).get("name") or "").strip()
    for node in (((issue.get("labels") or {}).get("nodes")) or [])
]
has_automerge = any(label.lower() == "automerge" for label in labels)

values = {
    "LINEAR_ISSUE_ID": issue["id"],
    "LINEAR_ISSUE_IDENTIFIER": issue["identifier"],
    "LINEAR_ISSUE_TITLE": issue["title"],
    "LINEAR_ISSUE_URL": issue["url"],
    "LINEAR_ISSUE_STATE": issue["state"]["name"],
    "LINEAR_ISSUE_HAS_AUTOMERGE": "1" if has_automerge else "0",
    "LINEAR_ISSUE_LABELS": ",".join(label for label in labels if label),
}

for key, value in values.items():
    print(key + "=" + shlex.quote(value or ""))
'
}

build_linear_comment_mutation() {
  local issue_id="$1"
  local body="$2"

  ISSUE_ID="$issue_id" COMMENT_BODY="$body" python3 - <<'PY'
import json
import os

print(json.dumps({
    "query": """
mutation AddCommentToIssue($issueId: String!, $body: String!) {
  commentCreate(input: {
    issueId: $issueId
    body: $body
  }) {
    success
  }
}
""",
    "variables": {
        "issueId": os.environ["ISSUE_ID"],
        "body": os.environ["COMMENT_BODY"],
    },
}))
PY
}

create_linear_comment() {
  local body="$1"
  local payload

  payload="$(build_linear_comment_mutation "$LINEAR_ISSUE_ID" "$body")"
  linear_graphql "$payload" >/dev/null
}

build_pr_linear_comment() {
  local pr_url="$1"
  local branch_name="$2"

  cat <<EOF
Автоматически подготовлен pull request для \`${LINEAR_ISSUE_IDENTIFIER}\`:
- PR: ${pr_url}
- Branch: \`${branch_name}\`
EOF
}

build_automerge_linear_comment() {
  local pr_url="$1"
  local branch_name="$2"
  local merge_message="$3"
  local source_repo_message="$4"

  cat <<EOF
Для задачи \`${LINEAR_ISSUE_IDENTIFIER}\` с label \`automerge\` выполнена post-review automation:
- PR: ${pr_url}
- Branch: \`${branch_name}\`
- GitHub: ${merge_message}
- Local main: ${source_repo_message}
EOF
}

find_open_pr_url() {
  local repo_slug="$1"
  local branch_name="$2"

  gh pr list --repo "$repo_slug" --head "$branch_name" --state open --limit 1 --json url |
    python3 -c '
import json
import sys

data = json.load(sys.stdin)
if data and data[0].get("url"):
    print(data[0]["url"])
'
}

find_latest_pr_url() {
  local repo_slug="$1"
  local branch_name="$2"

  gh pr list --repo "$repo_slug" --head "$branch_name" --state all --limit 1 --json url |
    python3 -c '
import json
import sys

data = json.load(sys.stdin)
if data and data[0].get("url"):
    print(data[0]["url"])
'
}

parse_pr_metadata() {
  python3 -c '
import json
import shlex
import sys

payload = json.load(sys.stdin)

values = {
    "PR_URL": payload.get("url") or "",
    "PR_STATE": payload.get("state") or "",
    "PR_MERGED_AT": payload.get("mergedAt") or "",
    "PR_IS_DRAFT": "1" if payload.get("isDraft") else "0",
    "PR_MERGE_STATE_STATUS": payload.get("mergeStateStatus") or "",
}

for key, value in values.items():
    print(key + "=" + shlex.quote(value))
'
}

load_pr_metadata() {
  local repo_slug="$1"
  local pr_url="$2"

  eval "$(
    gh pr view "$pr_url" \
      --repo "$repo_slug" \
      --json url,state,mergedAt,isDraft,mergeStateStatus |
      parse_pr_metadata
  )"
}

has_uncommitted_changes() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    return 0
  fi

  if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    return 0
  fi

  return 1
}

sync_source_repo() {
  local repo_path="${SOURCE_REPO_PATH:?SOURCE_REPO_PATH is required for automerge}"
  local branch_name=""
  local head_sha=""
  local origin_main_sha=""

  if [[ ! -d "$repo_path" ]]; then
    SOURCE_REPO_SYNC_STATUS="failed"
    SOURCE_REPO_SYNC_MESSAGE="путь \`${repo_path}\` не существует."
    return 1
  fi

  if ! branch_name="$(git -C "$repo_path" rev-parse --abbrev-ref HEAD 2>/dev/null)"; then
    SOURCE_REPO_SYNC_STATUS="failed"
    SOURCE_REPO_SYNC_MESSAGE="не удалось определить текущую ветку локального репозитория."
    return 1
  fi

  if [[ "$branch_name" != "main" ]]; then
    SOURCE_REPO_SYNC_STATUS="failed"
    SOURCE_REPO_SYNC_MESSAGE="локальный репозиторий находится не на \`main\`, а на \`${branch_name}\`."
    return 1
  fi

  git -C "$repo_path" fetch origin main >/dev/null

  head_sha="$(git -C "$repo_path" rev-parse HEAD)"
  origin_main_sha="$(git -C "$repo_path" rev-parse origin/main)"

  if [[ "$head_sha" != "$origin_main_sha" ]]; then
    if ! git -C "$repo_path" pull --ff-only origin main >/dev/null; then
      SOURCE_REPO_SYNC_STATUS="failed"
      SOURCE_REPO_SYNC_MESSAGE="не удалось выполнить \`git pull --ff-only origin main\`."
      return 1
    fi

    head_sha="$(git -C "$repo_path" rev-parse HEAD)"
    origin_main_sha="$(git -C "$repo_path" rev-parse origin/main)"
  fi

  if [[ "$head_sha" == "$origin_main_sha" ]]; then
    SOURCE_REPO_SYNC_STATUS="updated"
    SOURCE_REPO_SYNC_MESSAGE="локальный \`main\` синхронизирован на commit \`${head_sha:0:12}\`."
    return 0
  fi

  SOURCE_REPO_SYNC_STATUS="failed"
  SOURCE_REPO_SYNC_MESSAGE="локальный \`main\` всё ещё отстаёт от \`origin/main\`."
  return 1
}

merge_pr_for_automerge_issue() {
  local repo_slug="$1"
  local pr_url="$2"

  load_pr_metadata "$repo_slug" "$pr_url"

  if [[ "$PR_STATE" == "MERGED" || -n "$PR_MERGED_AT" ]]; then
    AUTOMERGE_STATUS="already_merged"
    AUTOMERGE_MESSAGE="PR уже смержен."
    return 0
  fi

  if [[ "$PR_IS_DRAFT" == "1" ]]; then
    AUTOMERGE_STATUS="failed"
    AUTOMERGE_MESSAGE="PR остаётся draft и не может быть смержен автоматически."
    return 1
  fi

  if gh pr merge --repo "$repo_slug" --merge "$pr_url" >/dev/null; then
    load_pr_metadata "$repo_slug" "$pr_url"

    if [[ "$PR_STATE" == "MERGED" || -n "$PR_MERGED_AT" ]]; then
      AUTOMERGE_STATUS="merged"
      AUTOMERGE_MESSAGE="PR автоматически смержен в \`main\`."
      return 0
    fi
  fi

  AUTOMERGE_STATUS="failed"
  AUTOMERGE_MESSAGE="не удалось автоматически смержить PR через GitHub CLI."
  return 1
}

issue_identifier="$(basename "$PWD")"
dry_run="${SYMPHONY_AUTO_PR_DRY_RUN:-0}"
AUTOMERGE_STATUS="not_requested"
AUTOMERGE_MESSAGE=""
SOURCE_REPO_SYNC_STATUS="not_run"
SOURCE_REPO_SYNC_MESSAGE="локальный \`main\` не обновлялся."

require_command curl
require_command git
require_command gh
require_command python3

: "${LINEAR_API_KEY:?LINEAR_API_KEY is required}"

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated." >&2
  exit 1
fi

linear_issue_json="$(linear_graphql "$(build_linear_issue_query "$issue_identifier")")"
eval "$(printf '%s' "$linear_issue_json" | parse_linear_issue)"

if [[ "$LINEAR_ISSUE_STATE" != "In Review" ]]; then
  echo "Skipping PR automation for $LINEAR_ISSUE_IDENTIFIER: state is '$LINEAR_ISSUE_STATE'." >&2
  exit 0
fi

branch_name="$(git branch --show-current)"
if [[ -z "$branch_name" ]]; then
  echo "Unable to determine current git branch." >&2
  exit 1
fi

if [[ "$branch_name" == "main" ]]; then
  echo "Refusing to create a PR from main." >&2
  exit 1
fi

if has_uncommitted_changes; then
  commit_message="${LINEAR_ISSUE_IDENTIFIER}: ${LINEAR_ISSUE_TITLE}"

  if [[ "$dry_run" == "1" ]]; then
    echo "DRY RUN: would create commit '$commit_message'." >&2
  else
    git add -A
    git commit -m "$commit_message"
  fi
fi

ahead_count="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
if [[ "$ahead_count" == "0" ]]; then
  message="Автоматический PR не создан: ветка \`${branch_name}\` не содержит коммитов поверх \`origin/main\`."

  if [[ "$dry_run" == "1" ]]; then
    echo "DRY RUN: would leave Linear comment: $message" >&2
  else
    create_linear_comment "$message"
  fi

  exit 0
fi

repo_slug="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

if [[ "$dry_run" == "1" ]]; then
  echo "DRY RUN: would push branch '$branch_name' to origin." >&2
  pr_url="https://github.com/${repo_slug}/pull/DRY-RUN"
else
  git push --force-with-lease --set-upstream origin "$branch_name"
  pr_url="$(find_open_pr_url "$repo_slug" "$branch_name")"
fi

if [[ -z "${pr_url:-}" ]]; then
  pr_title="[${LINEAR_ISSUE_IDENTIFIER}] ${LINEAR_ISSUE_TITLE}"
  pr_body_file="$(mktemp)"
  trap 'rm -f "$pr_body_file"' EXIT

  cat >"$pr_body_file" <<EOF
## Linear
- Issue: [${LINEAR_ISSUE_IDENTIFIER}](${LINEAR_ISSUE_URL})

## Context
Этот pull request был автоматически создан Symphony после перевода задачи в \`In Review\`.
EOF

  if [[ "$dry_run" == "1" ]]; then
    echo "DRY RUN: would create PR '$pr_title' with body:" >&2
    cat "$pr_body_file" >&2
    pr_url="https://github.com/${repo_slug}/pull/DRY-RUN"
  else
    if ! pr_url="$(
      gh pr create \
        --repo "$repo_slug" \
        --base main \
        --head "$branch_name" \
        --title "$pr_title" \
        --body-file "$pr_body_file"
    )"; then
      pr_url="$(find_latest_pr_url "$repo_slug" "$branch_name")"

      if [[ -z "${pr_url:-}" ]]; then
        echo "Unable to create or locate pull request for ${LINEAR_ISSUE_IDENTIFIER}." >&2
        exit 1
      fi
    fi
  fi
fi

if [[ "$LINEAR_ISSUE_HAS_AUTOMERGE" != "1" ]]; then
  if [[ "$dry_run" == "1" ]]; then
    echo "DRY RUN: would leave Linear comment with PR URL $pr_url." >&2
  else
    create_linear_comment "$(build_pr_linear_comment "$pr_url" "$branch_name")"
  fi

  echo "PR URL for ${LINEAR_ISSUE_IDENTIFIER}: ${pr_url}"
  exit 0
fi

if [[ "$dry_run" == "1" ]]; then
  AUTOMERGE_STATUS="merged"
  AUTOMERGE_MESSAGE="DRY RUN: PR был бы автоматически смержен в \`main\`."
  SOURCE_REPO_SYNC_STATUS="updated"
  SOURCE_REPO_SYNC_MESSAGE="DRY RUN: локальный \`main\` был бы синхронизирован."
else
  if merge_pr_for_automerge_issue "$repo_slug" "$pr_url"; then
    if ! sync_source_repo; then
      create_linear_comment \
        "$(build_automerge_linear_comment "$pr_url" "$branch_name" "$AUTOMERGE_MESSAGE" "$SOURCE_REPO_SYNC_MESSAGE")"
      exit 1
    fi
  else
    create_linear_comment \
      "$(build_automerge_linear_comment "$pr_url" "$branch_name" "$AUTOMERGE_MESSAGE" "$SOURCE_REPO_SYNC_MESSAGE")"
    exit 1
  fi
fi

create_linear_comment \
  "$(build_automerge_linear_comment "$pr_url" "$branch_name" "$AUTOMERGE_MESSAGE" "$SOURCE_REPO_SYNC_MESSAGE")"

echo "Automerge completed for ${LINEAR_ISSUE_IDENTIFIER}: ${pr_url}"
