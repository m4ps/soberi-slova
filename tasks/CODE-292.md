# [CODE]-[292] Удаление дублирования логики в domain/application/ui

## Что сделано

- Устранено дублирование hint/grid-логики между domain и ui:
  - добавлен `src/shared/word-grid.ts` с едиными helper'ами:
    - `findWordPathInGrid` (DFS путь слова по 8 направлениям в `5x5`);
    - `sortWordsByDifficulty` / `compareWordsByDifficulty`;
    - `HINT_META_TARGET_WORD_KEY`, `HINT_META_REVEAL_COUNT_KEY`.
  - `src/domain/CoreState/index.ts` и `src/adapters/RenderMotion/index.ts` переведены на общий модуль.
- Устранено дублирование runtime guard-валидации payload:
  - добавлен `src/shared/runtime-guards.ts` (`isRecordLike`, `parseNonNegativeSafeInteger`);
  - удалены локальные копии в `CoreState`, `Application`, `Persistence`, `PlatformYandex`.
- Добавлены unit-тесты shared-утилит:
  - `tests/shared.word-grid.test.ts`;
  - `tests/shared.runtime-guards.test.ts`.
- Для стабильной верификации lint в многориговом workspace уточнён `eslint.config.mjs`:
  - добавлен `tsconfigRootDir`;
  - исключён служебный контур `soberi_slova/**` из lint-скоупа.

## Верификация

- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск:
    `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-code292-smoke`;
  - артефакты: `output/web-game-code292-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют;
  - для локального smoke использовался временный `public/sdk.js` mock для `/sdk.js`; после проверки удалён.

## Принятые решения

- [ADR-039: Единые shared-утилиты для grid/hint и runtime guard-валидации](../ADR/ADR-039-shared-grid-guards-dedupe-code-292.md)
