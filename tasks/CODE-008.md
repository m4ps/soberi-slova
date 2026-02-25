# [CODE]-[008] Реализовать RenderMotion и one-screen UI без лишних сущностей

## Что сделано

- Переписан `RenderMotion` (`src/adapters/RenderMotion/index.ts`) под one-screen контракт PRD:
  - реализован layout одного экрана: `grid 5x5`, `progress x/N`, `all-time score`, кнопки `hint/reshuffle/leaderboard`;
  - добавлены pseudo-liquid in-drag линия и undo feedback;
  - добавлены success-анимации: green/yellow glow и перелёт букв к HUD-целям.
- Расширен application event-контракт:
  - добавлен `domain/word-submitted` в `src/application/contracts.ts` и `src/application/index.ts`;
  - в событии передаются `result`, `scoreDelta`, `progress`, `pathCells`, `wordSuccessOperationId` для event-driven визуализации submit-flow.
- Интегрирован event-driven completion pipeline в рендер-цикле:
  - `RenderMotion` автоматически dispatch'ит `AcknowledgeWordSuccessAnimation` и `AcknowledgeLevelTransitionDone` с задержками после соответствующих стадий.
- Синхронизированы input/layout границы:
  - добавлен `src/shared/game-layout.ts` как единый layout helper;
  - `InputPath` теперь принимает path только в геометрии grid, а также публикует path snapshots для drag feedback.
- Обновлены проверки:
  - `tests/application-command-bus.smoke.test.ts` — проверка `domain/word-submitted` payload;
  - `tests/input-path.adapter.test.ts` — layout-aware pointer сценарии и path snapshot callback;
  - `tests/render-layout.test.ts` — инварианты one-screen layout и приоритет grid на малом viewport.
- Синхронизирована документация:
  - `docs/observability/event-contracts.md`;
  - `README.md`.

## Верификация

- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск 1: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file output/actions-code008.json --iterations 3 --pause-ms 250 --screenshot-dir output/web-game-code008-smoke`;
  - запуск 2 (controls): `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file output/actions-code008-buttons.json --iterations 2 --pause-ms 300 --screenshot-dir output/web-game-code008-smoke-buttons`;
  - артефакты: `output/web-game-code008-smoke/*.png|state-*.json`, `output/web-game-code008-smoke-buttons/*.png|state-*.json`;
  - `errors-*.json` отсутствуют.
- Дополнительная ручная проверка через Playwright MCP:
  - drag-path для `дом`/`нос` обновляет `allTimeScore` и `progress` в `render_game_to_text`;
  - в момент после submit фиксируются `activeGlowAnimations > 0` и `activeFlyingLetters > 0`.

## Принятые решения

- [ADR-031: RenderMotion one-screen UI и event-driven submit animations](../ADR/ADR-031-render-motion-one-screen-ui-code-008.md)
