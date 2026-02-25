# [CODE]-[002] Реализовать InputPath для swipe-драг ввода и tail-undo

## Что сделано

- `src/adapters/InputPath/index.ts` переведён с bootstrap-заглушки на рабочий `InputPath`:
  - добавлен `InputPathEngine` для сборки пути в рамках одного жеста;
  - реализованы правила `8-way adjacency`, запрет повторного использования клетки и `tail-undo` только по предыдущей клетке;
  - невалидные/повторные клетки мягко игнорируются без штрафов;
  - submit-path отправляется только по `pointerup` через `SubmitPath(pathCells)`;
  - `pointercancel` отменяет текущий жест без submit;
  - добавлена защита от multi-touch конфликтов через фиксацию активного `pointerId`.
- Добавлен helper `resolveGridCellFromPointer` для детерминированного маппинга координат указателя в `5x5` grid.
- Добавлен unit-test suite `tests/input-path.adapter.test.ts`:
  - маппинг координат в сетку;
  - инварианты path-engine (`adjacency`, `tail-undo`, ignore invalid/repeated);
  - контракт adapter lifecycle (`submit only on pointerup`, `no submit on pointercancel`, корректный `dispose`).
- Синхронизированы project artifacts:
  - `BACKLOG.md` (`[CODE]-[002]` отмечена выполненной);
  - `CHANGELOG.md`;
  - `ADR/ADR-025-input-path-gesture-engine-code-002.md`.

## Верификация

- `npm run test -- tests/input-path.adapter.test.ts` — passed.
- `npm run ci:baseline` — passed (`typecheck`, `test`, `lint`, `format:check`, `build`).
- Playwright smoke (`develop-web-game`) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-code002-smoke`;
  - артефакты: `output/web-game-code002-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.
  - для локального smoke использовался временный `public/sdk.js` mock, удалён после прогона.

## Принятые решения

- [ADR-025: Gesture-driven InputPath engine для swipe-path и tail-undo](../ADR/ADR-025-input-path-gesture-engine-code-002.md)
