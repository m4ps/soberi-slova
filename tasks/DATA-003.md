# [DATA]-[003] Построить pipeline словаря из `data/dictionary.csv` (normalization + filtering)

## Что сделано

- Добавлен модуль `src/domain/WordValidation/dictionary-pipeline.ts`:
  - реализована загрузка CSV через `buildDictionaryIndexFromCsv`;
  - реализована нормализация `trim + lowercase` (`normalizeDictionaryWord`);
  - реализована валидация слов по правилу `^[а-яё]+$` (`isValidNormalizedDictionaryWord`);
  - реализована фильтрация строк по PRD-правилам (`type=noun`, lower-case, только кириллица);
  - реализована дедупликация по `normalized` c детерминированным выбором первого валидного вхождения;
  - реализован O(1) lookup индекс по normalized слову (`hasNormalizedWord` / `containsWord` / `getEntryByNormalizedWord`);
  - добавлена статистика отбраковки строк `rejectedByReason` для telemetry/log.
- Обновлён `src/domain/WordValidation/index.ts`:
  - валидатор переведён на общий normalizer;
  - pipeline API ре-экспортируется через публичный интерфейс модуля.
- Добавлен unit-test suite `tests/word-validation.dictionary-pipeline.test.ts`:
  - сценарии нормализации/фильтрации и reject-статистики на synthetic CSV;
  - typed-error сценарий (missing required columns);
  - загрузка реального `data/dictionary.csv` с проверкой консистентности stats + индекса.
- Добавлена документация `docs/data/dictionary-pipeline.md`.
- Обновлён `README.md` с описанием dictionary pipeline в data-контракте.

## Верификация

- `npm run test` — passed (включая новый suite `tests/word-validation.dictionary-pipeline.test.ts`).
- `npm run ci:baseline` — passed (`typecheck`, `test`, `lint`, `format:check`, `build`).
- Playwright smoke (`develop-web-game` client) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-data003-smoke`
  - использован временный `public/sdk.js` mock для `/sdk.js`, после прогона удалён;
  - артефакты: `output/web-game-data003-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-016: CSV pipeline словаря и O(1) индекс нормализованных слов](../ADR/ADR-016-dictionary-pipeline-data-003.md)
