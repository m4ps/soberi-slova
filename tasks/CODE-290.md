# [CODE]-[290] Приборка этапа кодирования

## Что сделано

- Выполнена приборка debug-only runtime-артефактов:
  - `src/main.ts`: диагностические хуки `window.render_game_to_text` и `window.advanceTime` теперь публикуются только в dev-режиме (`import.meta.env.DEV`);
  - для production-контуров добавлена явная очистка этих хуков из `window` на старте bootstrap и при fail-state.
- Уточнён глобальный типовой контракт:
  - `src/types/global.d.ts`: диагностические runtime API помечены как опциональные.
- Синхронизирована документация:
  - `README.md`: добавлен раздел про dev-only доступность диагностических хуков и их отсутствие в production сборке.

## Верификация

- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск:
    `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5174 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-code290-smoke`;
  - артефакты: `output/web-game-code290-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют;
  - для локального smoke использовался временный `public/sdk.js` mock для `/sdk.js`; после проверки удалён.

## Принятые решения

- [ADR-033: Runtime-диагностика только в dev-контуре](../ADR/ADR-033-runtime-diagnostics-dev-only-code-290.md)
