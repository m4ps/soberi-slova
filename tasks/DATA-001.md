# [DATA]-[001] Описать и реализовать доменные сущности состояния игры

## Что сделано

- Добавлен новый модуль `src/domain/GameState/index.ts` с типами:
  - `GameState`
  - `LevelSession`
  - `HelpWindow`
  - `PendingHelpRequest`
  - `PendingOperation`
  - `LeaderboardSyncState`
  - `WordEntry`
- Реализованы runtime-конструкторы:
  - `createGameState`, `createLevelSession`, `createHelpWindow`, `createPendingHelpRequest`
  - `createPendingOperation`, `createLeaderboardSyncState`, `createWordEntry`
- Реализован JSON snapshot контракт:
  - `serializeGameState` / `deserializeGameState`
  - `serializeWordEntry` / `deserializeWordEntry`
- Добавлены fail-fast проверки malformed payload на десериализации с единым префиксом ошибок `[game-state]`.
- Добавлена документация схемы данных: `docs/data/game-state-schema.md`.
- README синхронизирован с новым data-модулем и ссылкой на схему.

## Верификация

- `npm run ci:baseline` — passed (`typecheck`, `test`, `lint`, `format:check`, `build`).
- Playwright smoke (`develop-web-game` client) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-data001-smoke`
  - для локального smoke использовался временный `public/sdk.js` mock; после прогона удалён.
  - артефакты: `output/web-game-data001-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`.
  - `errors-*.json` отсутствуют.
- Добавлен тестовый suite `tests/game-state.model.test.ts`:
  - проверка runtime-конструкторов и default-полей;
  - проверка deep-copy поведения;
  - проверка JSON round-trip без потери структуры;
  - проверка controlled-failure на malformed snapshot.

## Принятые решения

- [ADR-014: Базовая версия state-модели и JSON snapshot-контракт](../ADR/ADR-014-data-state-model-data-001.md)
