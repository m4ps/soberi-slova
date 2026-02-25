# [CODE]-[291] Удаление ненужных реализаций вне v1 scope

## Что сделано

- Выполнен scope-cleanup `GameState` миграций:
  - `src/domain/GameState/index.ts`: из шага `v1 -> v2` удалена специальная обработка legacy полей из cut-list (`sessionScore`, `achievements`, `dailyQuests`, `tutorial*`, `pendingHelpRequest.requestedAt`);
  - миграция `v1 -> v2` упрощена до нормализации `schemaVersion=2`.
- Зафиксирован единый v1 контракт хранения:
  - сохранение только полей актуальной схемы обеспечивается strict runtime-конструкторами (`createGameState`, `createLevelSession`, `createHelpWindow`), которые работают как allowlist.
- Синхронизирована документация:
  - `README.md`;
  - `docs/data/game-state-schema.md`.

## Верификация

- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск:
    `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-code291-smoke`;
  - артефакты: `output/web-game-code291-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют;
  - для локального smoke использовался временный `public/sdk.js` mock для `/sdk.js`; после проверки удалён.

## Принятые решения

- [ADR-034: Удаление out-of-scope legacy-обработки из миграции GameState](../ADR/ADR-034-v1-scope-legacy-migration-pruning-code-291.md)
