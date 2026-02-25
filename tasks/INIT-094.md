# [INIT]-[094] Приведение кода этапа к единому стандарту

## Что сделано

- Введён общий `shared`-слой для стандартов init-этапа:
  - `src/shared/errors.ts` — единый helper `toErrorMessage`.
  - `src/shared/module-ids.ts` — единый реестр `MODULE_IDS` для всех init-модулей.
- Удалены локальные дубли `toErrorMessage` из:
  - `src/main.ts`;
  - `src/application/index.ts`;
  - `src/adapters/PlatformYandex/index.ts`.
- Все init-модули приведены к единому шаблону `moduleName` через `MODULE_IDS`:
  - `src/domain/CoreState/index.ts`
  - `src/domain/HelpEconomy/index.ts`
  - `src/domain/LevelGenerator/index.ts`
  - `src/domain/WordValidation/index.ts`
  - `src/adapters/InputPath/index.ts`
  - `src/adapters/Persistence/index.ts`
  - `src/adapters/RenderMotion/index.ts`
  - `src/adapters/PlatformYandex/index.ts`
  - `src/adapters/Telemetry/index.ts`
- Документация синхронизирована с кодовой структурой: в `README.md` добавлен каталог `src/shared`.

## Верификация

- `npm run ci:baseline` — passed (`typecheck`, `test`, `lint`, `format:check`, `build`).
- Playwright smoke (`develop-web-game` client) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://localhost:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-init094-smoke-clean`
  - перед запуском добавлялся временный локальный mock `public/sdk.js` для `/sdk.js` в dev-контуре без proxy; после smoke mock удалён.
  - артефакты: `output/web-game-init094-smoke-clean/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`.
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-013: Единый стандарт init-кода через shared-константы и утилиты](../ADR/ADR-013-init-unified-code-standard.md)
