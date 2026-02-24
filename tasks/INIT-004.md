# [INIT]-[004] Реализовать platform bootstrap для YaGames SDK и локального dev-proxy

## Что сделано

- В `src/adapters/PlatformYandex/index.ts` реализован рабочий `PlatformYandex` адаптер:
  - bootstrap через `YaGames.init()`;
  - `LoadingAPI.ready()` на этапе готовности;
  - `GameplayAPI.start()` на старте и `GameplayAPI.stop()/start()` на `game_api_pause/game_api_resume`;
  - `dispose()` со снятием SDK lifecycle-подписок и остановкой gameplay;
  - структурированный lifecycle-log (`getLifecycleLog`) для диагностики и smoke-проверок.
- В `src/main.ts` расширен `render_game_to_text`: добавлен `platformLifecycle` для наблюдаемости bootstrap-цепочки.
- Добавлены контрактные тесты адаптера `tests/platform-yandex.adapter.test.ts`:
  - happy-path bootstrap;
  - pause/resume wiring;
  - корректный dispose/unsubscribe;
  - контролируемая ошибка при недоступном SDK.
- Обновлена инфраструктура dev-proxy:
  - добавлена зависимость `@yandex-games/sdk-dev-proxy`;
  - добавлены npm scripts `dev:proxy` и `dev:proxy:prod`;
  - README дополнен пошаговыми инструкциями для dev/draft/prod режимов.

## Верификация

- `npm run typecheck` — passed
- `npm run test` — passed
- `npm run build` — passed
- Playwright smoke через `develop-web-game` client + `sdk-dev-proxy` (dev-mode, proxy URL `https://localhost:8081`) — passed:
  - скриншоты: `output/web-game-init004-proxy/shot-0.png`, `shot-1.png`
  - state snapshots: `output/web-game-init004-proxy/state-0.json`, `state-1.json`
  - console errors: отсутствуют (`errors-*.json` не созданы)
  - в `render_game_to_text` зафиксирована lifecycle-цепочка `sdk-init-start -> sdk-init-success -> loading-ready -> gameplay-start -> runtime-ready-dispatched -> bootstrap-complete`.

## Принятые решения

- [ADR-007: Platform bootstrap через YaGames SDK и lifecycle wiring для INIT-004](../ADR/ADR-007-platform-bootstrap-init-004.md)
