# [DATA]-[192] Удаление дублирования схем, DTO и валидаторов

## Что сделано

- Вынесены общие правила data-валидации в единый модуль:
  - `src/domain/data-contract.ts`:
    - `normalizeCyrillicWord`;
    - `isLowercaseCyrillicWord`;
    - `isLowercaseCyrillicLetter`;
    - `isLengthInRange`;
    - `parseStrictIntegerString`;
    - `parseFiniteNumberString`.
- `src/domain/WordValidation/dictionary-pipeline.ts` переведён на shared helpers:
  - убраны локальные дубли нормализации слов и парсинга `id/rank`.
- `src/domain/GameState/index.ts` переведён на shared data-rules:
  - валидация кириллицы/`ё` и target length range больше не дублирует локальные regex/range checks.
- Консолидированы дубли DTO-типов в `GameState`:
  - `WordEntryInput`, `PendingHelpRequestInput`, `PendingOperationInput`, `LeaderboardSyncStateInput`
    переведены в aliases;
  - `HelpWindowInput`, `LevelSessionInput`, `GameStateInput` сведены через `extends Omit<...>`.
- Упрощены parse-ветки `to*Input` в `GameState`:
  - валидация переиспользует runtime-конструкторы `create*`, без повторного копипаста проверок.
- Добавлен unit-test suite `tests/data-contract.test.ts` для shared data-helpers.
- Обновлена документация:
  - `docs/data/game-state-schema.md`;
  - `docs/data/dictionary-pipeline.md`;
  - `README.md`;
  - `CHANGELOG.md`;
  - `BACKLOG.md` (`[DATA]-[192]` отмечена выполненной).

## Верификация

- `npm run ci:baseline` — passed (`typecheck`, `test`, `lint`, `format:check`, `build`).
- Playwright smoke (`develop-web-game`) — passed:
  - запуск:
    `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-data192-smoke`;
  - использован временный `public/sdk.js` mock для `/sdk.js`, после прогона удалён;
  - артефакты: `output/web-game-data192-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-021: Консолидация data-валидаторов и DTO в data-слое](../ADR/ADR-021-data-validator-dedup-data-192.md)
