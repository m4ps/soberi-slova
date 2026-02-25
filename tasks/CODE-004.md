# [CODE]-[004] Реализовать CoreState scoring/progression в state-first порядке

## Что сделано

- `src/domain/CoreState/index.ts` расширен до stateful доменного модуля:
  - хранит и возвращает `runtimeMode + gameState + gameplay snapshot`;
  - реализует `submitPath(pathCells)` в state-first порядке через `WordValidation`.
- В `CoreState` зафиксирован scoring/progression контракт PRD:
  - `target: 10 + 2 * len`;
  - `bonus: 2 + len`;
  - `level clear: 30 + 5 * N`;
  - прогресс уровня рассчитывается как `x/N` (`foundTargets/targetWords`).
- Добавлены anti-exploit/idempotency guard-правила:
  - `repeat` и `invalid` — silent no-op;
  - `level clear` начисляется ровно один раз на финальный target;
  - после `levelStatus=completed` bonus/target submit больше не начисляют очки.
- `src/application/index.ts` обновлён для `SubmitPath`:
  - `coreState.submitPath(...)` вызывается до `routeCommand`, чтобы state фиксировался до event/animation цепочек.
- Добавлены тесты:
  - `tests/core-state.scoring.test.ts` — формулы score, progress, idempotency, post-completion bonus guard;
  - `tests/application-command-bus.smoke.test.ts` — state-first интеграционная проверка для `SubmitPath`.
- Синхронизированы артефакты проекта:
  - `BACKLOG.md` (`[CODE]-[004]` отмечена выполненной);
  - `CHANGELOG.md`;
  - `README.md`;
  - `ADR/ADR-027-core-state-scoring-progression-code-004.md`.

## Верификация

- `npm run test -- tests/core-state.scoring.test.ts tests/application-command-bus.smoke.test.ts` — passed.
- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-code004-smoke`;
  - артефакты: `output/web-game-code004-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.
  - для локального smoke использовался временный `public/sdk.js` mock, удалён после прогона.

## Принятые решения

- [ADR-027: CoreState scoring/progression state-first контракт](../ADR/ADR-027-core-state-scoring-progression-code-004.md)
