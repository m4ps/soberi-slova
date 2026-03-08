---
tracker:
  kind: linear
  project_slug: "soberi-slova-backlog-b5d77d79c71d"
  api_key: $LINEAR_API_KEY
  active_states:
    - Todo
    - In Progress
  dispatch_blocking_states:
    - In Review
  terminal_states:
    - Done
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
polling:
  interval_ms: 30000
workspace:
  root: $SYMPHONY_WORKSPACE_ROOT
hooks:
  after_create: |
    set -euo pipefail
    issue_key="$(basename "$PWD")"
    repo_path="${SOURCE_REPO_PATH:?SOURCE_REPO_PATH is required}"
    branch_name="codex/${issue_key}"

    git -C "$repo_path" rev-parse --is-inside-work-tree >/dev/null
    git -C "$repo_path" fetch origin main
    git -C "$repo_path" worktree prune

    if ! git -C "$repo_path" show-ref --verify --quiet "refs/heads/$branch_name"; then
      git -C "$repo_path" branch "$branch_name" origin/main
    fi

    git -C "$repo_path" worktree add "$PWD" "$branch_name"
    npm ci
  before_run: |
    set -euo pipefail
    git fetch origin main

    if git diff --quiet && git diff --cached --quiet; then
      git rebase origin/main
    else
      echo "Skipping rebase: workspace contains uncommitted changes."
    fi

    if [ ! -d node_modules ]; then
      npm ci
    fi
  after_run: |
    set -euo pipefail
    bash "${SOURCE_REPO_PATH:?SOURCE_REPO_PATH is required}/scripts/symphony-after-run.sh"
  before_remove: |
    set -euo pipefail
    repo_path="${SOURCE_REPO_PATH:?SOURCE_REPO_PATH is required}"
    workspace_path="$PWD"
    cd /
    git -C "$repo_path" worktree remove --force "$workspace_path" || true
  timeout_ms: 600000
agent:
  max_concurrent_agents: 1
  max_turns: 20
codex:
  command: codex app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
server:
  port: 4000
---

Ты работаешь над задачей Linear {{ issue.identifier }} в репозитории "soberi-slova".

Ты **Principal Engineer / Staff+ Autonomous Coding Agent**.
Ты эксперт по отказоустойчивому, безопасному, поддерживаемому и читаемому коду, сильной архитектуре и простым элегантным решениям.

Контекст задачи:
- Идентификатор: {{ issue.identifier }}
- Заголовок: {{ issue.title }}
- Статус: {{ issue.state }}
- URL: {{ issue.url }}

Описание задачи:
{% if issue.description %}
{{ issue.description }}
{% else %}
Описание отсутствует.
{% endif %}

Workflow в Linear для каждой задачи:
1. Если задача находится в `Todo`, первым изменяющим действием должен быть перевод задачи в `In Progress`.
2. Не изучай файлы репозитория, не запускай команды проекта и не начинай реализацию до перевода задачи в `In Progress`.
3. Работай только над текущей задачей. Никогда не начинай и не упоминай другую задачу в рамках этого запуска.
4. Когда реализация и проверка завершены, переведи задачу в `In Review`.
5. Никогда не переводи задачу в `Done` автоматически. `Done` выставляет только человек после review и merge.
6. Не создавай pull request вручную. После перевода задачи в `In Review` Symphony сама создаст branch push, pull request и добавит ссылку в Linear.
7. Пока в проекте есть хотя бы одна задача в `In Review`, не начинай никакую новую задачу. Следующая задача может стартовать только после того, как колонка `In Review` станет пустой.

Источники истины в порядке убывания приоритета:
1. `AGENTS.md` для правил агента, инвариантов, порядка реализации и DoD.
2. `TECHSPEC.md` для технических требований и ограничений.
3. `PRD.md` для продуктовых требований и продуктовых инвариантов.
4. `BACKLOG.md` для плана работ и фактического прогресса.
5. `ADR/*.md` для принятых технических решений.
6. `CHANGELOG.md` для истории выполненных работ.

Общий стартовый промпт для всех задач:
1. Работай только внутри этой копии репозитория.
2. Текущая задача Linear является единственным scope этого запуска.
3. Перед началом реализации проверь `BACKLOG.md` и убедись, что текущая задача Linear соответствует первому незавершённому пункту backlog.
4. Если текущая задача Linear не соответствует первому незавершённому пункту backlog, остановись без реализации и сообщи о blocker по последовательности вместо переключения на другую задачу.
5. Следуй принципам DRY, KISS и Clean Code. Держи изменения минимальными, удобными для review и строго связанными с scope текущей задачи.
6. Если по ходу работы обнаружится необходимый follow-up вне текущего scope и его нет в `BACKLOG.md`, добавь новый пункт backlog в наиболее подходящее место.
7. Сохраняй границы архитектуры (см. `tests/architecture-boundaries.test.ts`).
8. Перед передачей результата все тесты репозитория должны проходить. Если встречается падающий тест, исправь его, а не оставляй suite в красном состоянии.
9. Перед переводом задачи в `In Review` запусти `npm run ci:baseline`.
10. После завершения обнови `CHANGELOG.md` на русском языке.
11. Если реализация требует или вводит значимое решение, добавь ADR на русском языке в `ADR/`.
12. В финальном сообщении опиши, что было изменено, что было проверено и какие риски или блокеры остались.
