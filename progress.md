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
