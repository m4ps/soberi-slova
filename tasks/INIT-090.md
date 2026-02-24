# [INIT]-[090] Приборка этапа и удаление временных артефактов

## Что сделано

- Удалён временный файл `progress.md` из репозитория как нецелевой init-артефакт.
- В `.gitignore` добавлено правило `progress.md`, чтобы временные handoff-файлы не попадали в VCS.
- В `package.json` добавлена команда `clean:init`:
  - удаляет `dist/`, `output/`, `.DS_Store` и `progress.md`;
  - даёт воспроизводимый способ локальной приборки после smoke/build циклов.
- В `README.md` обновлён список инженерных команд и текущий статус инициализационного этапа.

## Верификация

- `npm run clean:init` — passed
- `npm run ci:baseline` — passed
- Playwright smoke через `develop-web-game` client — passed:
  - запуск клиента: `web_game_playwright_client.js` c actions из `action_payloads.json`;
  - проверены state snapshots `mode=ready`, portrait viewport и lifecycle-цепочка bootstrap;
  - критичных runtime ошибок в smoke-артефактах нет.

## Принятые решения

- [ADR-009: Политика хранения временных init-артефактов](../ADR/ADR-009-init-artifact-hygiene.md)
