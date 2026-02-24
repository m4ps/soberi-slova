# [INIT]-[002] Внедрить архитектурные слои и модульные границы из TECHSPEC

## Что сделано

- Добавлена слоистая структура исходников:
  - `src/domain` — `CoreState`, `WordValidation`, `LevelGenerator`, `HelpEconomy`.
  - `src/application` — use-case слой, command/event/read-model контракты.
  - `src/adapters` — `InputPath`, `RenderMotion`, `PlatformYandex`, `Persistence`, `Telemetry`.
- Для каждого требуемого модуля создан публичный интерфейс через `index.ts`.
- `src/main.ts` переведён в composition root и связывает модули только через application-слой.
- Добавлен автоматический тест архитектурных границ `tests/architecture-boundaries.test.ts`, который проверяет допустимые направления импортов между слоями.
- README обновлён диаграммой слоёв и описанием модулей.

## Верификация

- `npm run typecheck` — passed
- `npm run test` — passed
- `npm run build` — passed
- Playwright smoke через `$WEB_GAME_CLIENT` (URL `http://127.0.0.1:4173`) — passed:
  - `output/web-game/state-0.json`, `state-1.json` подтверждают корректный `render_game_to_text`.
  - `output/web-game/shot-0.png`, `shot-1.png` визуально подтверждают стабильный рендер canvas.
  - критичных console errors в артефактах прогона не обнаружено.

## Принятые решения

- [ADR-005: Слоистые модульные границы для INIT-002](../ADR/ADR-005-layered-boundaries-init-002.md)
