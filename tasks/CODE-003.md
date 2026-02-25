# [CODE]-[003] Реализовать WordValidation и apply-логику target/bonus/repeat

## Что сделано

- `src/domain/WordValidation/index.ts` расширен до submit-path контракта:
  - добавлен `resolveWordFromPath(grid, pathCells)` для сборки слова из пути в `5x5` grid;
  - добавлен `validatePathWord(...)` с однозначной классификацией `target|bonus|repeat|invalid`;
  - добавлен `applyPathWord(...)` для state-first apply-логики `foundTargets/foundBonuses`.
- Поведение apply-логики зафиксировано:
  - `target` добавляет слово в `foundTargets`;
  - `bonus` добавляет слово в `foundBonuses`;
  - `repeat` и `invalid` возвращают `isSilent=true` и не меняют state.
- Сохранён доменный инвариант словаря: `ё` и `е` считаются разными буквами.
- Добавлен unit-test suite `tests/word-validation.test.ts`:
  - классификация всех исходов;
  - path->word сборка и негативные кейсы malformed payload;
  - проверка `ё != е`;
  - проверка отсутствия state-изменений для `repeat/invalid`.
- Синхронизированы project artifacts:
  - `BACKLOG.md` (`[CODE]-[003]` отмечена выполненной);
  - `CHANGELOG.md`;
  - `README.md`;
  - `ADR/ADR-026-word-validation-submit-path-code-003.md`.

## Верификация

- `npm run test -- tests/word-validation.test.ts` — passed.
- `npm run test` — passed.
- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-code003-smoke`;
  - артефакты: `output/web-game-code003-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.
  - для локального smoke использовался временный `public/sdk.js` mock, удалён после прогона.

## Принятые решения

- [ADR-026: WordValidation submit-path классификация и apply-логика](../ADR/ADR-026-word-validation-submit-path-code-003.md)
