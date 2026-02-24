# [INIT]-[003] Подготовить command bus, envelopes результатов и доменные ошибки

## Что сделано

- В `src/application/contracts.ts` введены typed-контракты:
  - `ApplicationCommand` с обязательными командами v1 из TECHSPEC.
  - `ApplicationQuery` (`GetCoreState`, `GetHelpWindowState`).
  - `ApplicationResult<T>` в формате `ok | domainError | infraError`.
  - `ApplicationError` формата `{ code, message, retryable, context }`.
- В `src/application/index.ts` реализован единый in-memory bus:
  - централизованная маршрутизация команд;
  - query-исполнение через единый `execute`;
  - унифицированная обработка `domainError` и `infraError`.
- Адаптеры переведены на новые контракты bus:
  - `InputPath` → команда `Tick`.
  - `PlatformYandex` → команда `RuntimeReady`.
  - `Persistence` → `RestoreSession` + чтение через query bus.
- Добавлен интеграционный smoke-тест `tests/application-command-bus.smoke.test.ts`, проверяющий:
  - маршрутизацию обязательных команд v1;
  - корректность query-контрактов;
  - `domainError` envelope на невалидном `SubmitPath`.

## Верификация

- `npm run typecheck` — passed
- `npm run test` — passed
- `npm run build` — passed
- Playwright smoke через `develop-web-game` client (preview `http://127.0.0.1:4173`) — passed:
  - скриншоты: `output/web-game/shot-0.png`, `output/web-game/shot-1.png`
  - state snapshots: `output/web-game/state-0.json`, `output/web-game/state-1.json`
  - критичных console errors не зафиксировано

## Принятые решения

- [ADR-006: Единый command/query bus и result envelope для INIT-003](../ADR/ADR-006-command-bus-init-003.md)
