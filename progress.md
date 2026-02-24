Original prompt: Найди первую невыполненную задачу в @BACKLOG.md, выполни её по AGENTS/TECHSPEC/PRD, обнови BACKLOG/CHANGELOG/ADR/tasks, прогони тесты и сделай commit+push.

## 2026-02-24 INIT-001
- Собраны требования из AGENTS.md, BACKLOG.md, TECHSPEC.md и PRD.md.
- Для bootstrap использован стек TypeScript + PixiJS v8 + Vite.
- Создан каркас: src/assets/tests + базовые конфиги и README.
- Исправлен type-safety дефект: root container теперь извлекается через `getRootElement()` без nullable-пути.
- Исправлен детерминированный хук времени: `window.advanceTime` теперь делает безопасный рендер-степ через `app.render()`; фон зафиксирован через `backgroundColor`.
- Для стабильного smoke-рендера добавлен статический stage-backdrop (без геймплейной логики), чтобы canvas всегда содержал однозначный кадр.
- Исправлен артефакт Playwright-снимков: включён `preserveDrawingBuffer` для корректного повторного `toDataURL` захвата WebGL canvas.
- Обновлены проектные артефакты по задаче: BACKLOG (INIT-001 done), CHANGELOG, ADR-004, отчёт tasks/INIT-001.md.
- Git: создана ветка `codex/init-001-bootstrap`, сделаны коммиты. Push в `origin` заблокирован: remote `origin` не настроен в текущем workspace.

## 2026-02-24 INIT-002
- Первая невыполненная задача определена как `[INIT]-[002]`.
- Введены слои `domain/application/adapters` с публичными интерфейсами для модулей: CoreState, InputPath, WordValidation, LevelGenerator, HelpEconomy, RenderMotion, PlatformYandex, Persistence, Telemetry.
- `main.ts` переведён на composition root с wiring через application-слой.
- Добавлен архитектурный guard `tests/architecture-boundaries.test.ts`.
- Для Node-типов в тестах добавлены `@types/node` и `types: ["node"]` в `tsconfig.json`.
- Прогон верификации: `typecheck`, `test`, `build` — passed.
- Playwright smoke выполнен через `$WEB_GAME_CLIENT`; актуальные артефакты: `output/web-game/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`.

### TODO / Next
- INIT-003: добавить typed command bus + result envelopes (`ok/domainError/infraError`) поверх текущего application-слоя.
- INIT-004: заменить `PlatformYandex` stub на реальный `YaGames` bootstrap + lifecycle hooks.

## 2026-02-24 INIT-003
- Первая невыполненная задача подтверждена: `[INIT]-[003]`.
- Введены typed-контракты `ApplicationCommand`/`ApplicationQuery`, включая обязательные команды v1 из TECHSPEC.
- Реализованы единые envelopes:
  - `ApplicationResult<T>` с ветками `ok | domainError | infraError`.
  - `ApplicationError` формата `{ code, message, retryable, context }`.
- Application-layer переведён на централизованную маршрутизацию через `commands.dispatch` и `queries.execute`.
- Адаптеры синхронизированы с новым bus-контрактом (`InputPath`, `PlatformYandex`, `Persistence`).
- Добавлен интеграционный smoke-тест `tests/application-command-bus.smoke.test.ts` на маршрутизацию обязательных команд и `domainError` для невалидного `SubmitPath`.
- Верификация:
  - `npm run typecheck` — passed
  - `npm run test` — passed
  - `npm run build` — passed
  - Playwright smoke (`web_game_playwright_client.js`, preview `http://127.0.0.1:4173`) — passed; проверены `shot-0.png/shot-1.png`, `state-0.json/state-1.json`, критичных console errors нет.
- Обновлены артефакты задачи: `BACKLOG.md`, `CHANGELOG.md`, `README.md`, `tasks/INIT-003.md`, `ADR/ADR-006-command-bus-init-003.md`.

### TODO / Next
- INIT-004: заменить `PlatformYandex` stub на реальный `YaGames.init()` + lifecycle (`LoadingAPI.ready`, `GameplayAPI.start/stop`, pause/resume).

## 2026-02-24 INIT-004 (in progress)
- Реализован `PlatformYandex` adapter с реальным lifecycle bootstrap:
  - `YaGames.init()` через runtime-global,
  - `LoadingAPI.ready()`,
  - `GameplayAPI.start()` на старте,
  - обработка `game_api_pause`/`game_api_resume` с `GameplayAPI.stop()/start()`,
  - `dispose()` снимает подписки и останавливает gameplay.
- Добавлен структурированный lifecycle-log внутри адаптера (`getLifecycleLog`) и подключён в `window.render_game_to_text` для наблюдаемости smoke-прогонов.
- Добавлены контрактные тесты `tests/platform-yandex.adapter.test.ts` на bootstrap, pause/resume, dispose и поведение при отсутствии SDK.
- Исправлен конфликт параметров `sdk-dev-proxy`: `--host` и `--path` взаимоисключающие; npm scripts обновлены на корректный вариант с `--host`.
- README обновлен: добавлены инструкции для `dev:proxy`, `dev:proxy:prod`, draft/prod тест-режимов и кейса нестандартного порта Vite.
- Прогон smoke через proxy выполнен на связке `vite preview (4173) + sdk-dev-proxy (8081, dev-mode=true)`:
  - артефакты: `output/web-game-init004-proxy/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - ошибок консоли не зафиксировано.
- Оформлены артефакты задачи: `ADR/ADR-007-platform-bootstrap-init-004.md`, `tasks/INIT-004.md`, обновлены `BACKLOG.md`, `CHANGELOG.md`.

### TODO / Next
- INIT-005: добавить инженерный baseline `lint/typecheck/build/test` и CI pipeline по TECHSPEC gates.
- INIT-090+: после baseline провести cleanup временных артефактов init-этапа.

## 2026-02-24 INIT-005
- Первая невыполненная задача подтверждена: `[INIT]-[005]`.
- Добавлены baseline quality scripts: `lint`, `lint:fix`, `format`, `format:check`, `ci:baseline`.
- Подключены baseline-конфиги качества:
  - `eslint.config.mjs` (flat config для TypeScript);
  - `.prettierrc.json` + `.prettierignore`.
- Добавлен CI workflow `.github/workflows/ci.yml` с pre-merge последовательностью:
  `typecheck -> test -> lint -> format:check -> build`.
- README обновлен: зафиксированы новые команды и обязательный pre-merge pipeline.
- Верификация baseline:
  - `npm run lint` — passed;
  - `npm run format:check` — passed (после одноразового `npm run format`);
  - `npm run typecheck` — passed;
  - `npm run test` — passed;
  - `npm run build` — passed;
  - `npm run ci:baseline` — passed.
- Playwright smoke через `develop-web-game` client выполнен с `sdk-dev-proxy`:
  - артефакты: `output/web-game-init005-baseline/shot-0.png`, `shot-1.png`,
    `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют;
  - визуально кадр и `render_game_to_text` консистентны (`mode=ready`, портретный viewport).
- Оформлены проектные артефакты задачи:
  - `ADR/ADR-008-engineering-baseline-init-005.md`;
  - `tasks/INIT-005.md`;
  - обновлены `BACKLOG.md`, `CHANGELOG.md`.

### TODO / Next
- INIT-090: удалить временные артефакты этапа инициализации после baseline-инвентаризации.
