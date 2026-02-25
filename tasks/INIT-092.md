# [INIT]-[092] Удаление дублирования в конфигурации и bootstrap-логике

## Что сделано

- Введён единый модуль bootstrap-констант YaGames:
  - добавлен `src/config/platform-yandex.ts`;
  - константы `sdk.js` path, lifecycle event names, timeout и marker убраны из локальных дублей.
- Обновлён `PlatformYandex` адаптер:
  - переведён на shared-константы;
  - исключены повторяющиеся строковые литералы lifecycle подписок/отписок.
- Обновлён контрактный тест `tests/platform-yandex.adapter.test.ts`:
  - использует тот же shared source для lifecycle event names/type, что и runtime.
- Конфигурация dev/proxy среды централизована:
  - добавлен `config/runtime-ports.json` (dev/preview/proxy порты);
  - добавлен единый runner `scripts/run-sdk-dev-proxy.mjs`;
  - scripts `dev:proxy` и `dev:proxy:prod` в `package.json` переведены на runner;
  - `vite.config.ts` читает тот же `runtime-ports.json`.
- Удалён шаблонный код routed-команд в `src/application/index.ts` через helper’ы:
  - `routeCommand`;
  - `routeHelpCommand`.
- README синхронизирован с новой схемой единого runtime/proxy-конфига.

## Верификация

- `npm run ci:baseline` — passed:
  - `typecheck` — passed
  - `test` — passed
  - `lint` — passed
  - `format:check` — passed
  - `build` — passed
- Playwright smoke (по скиллу `develop-web-game`) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://localhost:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-init092-smoke`
  - использован временный локальный mock `/sdk.js` для smoke в локальном контуре;
  - артефакты: `output/web-game-init092-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - ошибок консоли нет (`errors-*.json` не созданы).

## Принятые решения

- [ADR-011: Единый источник bootstrap-констант и dev-proxy конфигурации](../ADR/ADR-011-init-shared-bootstrap-config.md)
