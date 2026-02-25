# [DATA]-[191] Удаление ненужных структур и полей данных

## Что сделано

- Проведена ревизия state-схемы относительно v1 scope (`TECHSPEC` + `PRD`):
  - из `PendingHelpRequest` удалено deprecated поле `requestedAt` как неиспользуемое в актуальном контракте;
  - `GAME_STATE_SCHEMA_VERSION` повышена до `2`.
- В `src/domain/GameState/index.ts` добавлена deterministic миграция `v1 -> v2`:
  - удаляет out-of-scope legacy поля `sessionScore`, `achievements`, `dailyQuests`, `tutorialTrace/tutorialTraces`;
  - очищает `helpWindow.pendingHelpRequest` от `requestedAt`.
- Синхронизированы типы/сериализация/валидация:
  - обновлены интерфейсы `PendingHelpRequest` и `PendingHelpRequestInput`;
  - обновлены runtime-конструкторы и десериализация snapshot.
- Обновлены тесты `tests/game-state.model.test.ts`:
  - migration chain для legacy snapshot теперь проверяется как `v0 -> v1 -> v2`;
  - добавлен тест на зачистку out-of-scope полей при миграции `v1 -> v2`.
- Обновлена документация:
  - `docs/data/game-state-schema.md`;
  - `README.md`;
  - `CHANGELOG.md`;
  - `BACKLOG.md` (`[DATA]-[191]` отмечена выполненной).

## Верификация

- `npm run ci:baseline` — passed (`typecheck`, `test`, `lint`, `format:check`, `build`).
- Playwright smoke (`develop-web-game`) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-data191-smoke`;
  - использован временный `public/sdk.js` mock для `/sdk.js`, после прогона удалён;
  - артефакты: `output/web-game-data191-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-020: Сужение snapshot-схемы до v1 scope](../ADR/ADR-020-data-schema-v1-scope-data-191.md)
