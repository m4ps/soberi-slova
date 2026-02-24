# CHANGELOG

## 2026-02-24

### [INIT]-[002] Архитектурные слои и модульные границы
- Внедрена слоистая структура `src/domain`, `src/application`, `src/adapters` по правилу зависимостей `Adapters -> Application -> Domain`.
- Добавлены публичные контракты-заглушки модулей: `CoreState`, `InputPath`, `WordValidation`, `LevelGenerator`, `HelpEconomy`, `RenderMotion`, `PlatformYandex`, `Persistence`, `Telemetry`.
- `src/main.ts` переведён в роль composition root: wiring модулей выполняется через application-слой без прямых зависимостей верхнего слоя на domain.
- Добавлен автоматический guard-тест `tests/architecture-boundaries.test.ts`, проверяющий import-граф на нарушение слоёв.
- README дополнен диаграммой и описанием архитектурных модулей.
- Для typecheck тестов добавлена зависимость `@types/node`.

### [INIT]-[001] Bootstrap проекта
- Создан стартовый каркас проекта на TypeScript + PixiJS v8 + Vite.
- Добавлены базовые директории `src/`, `assets/`, `tests/`, а также `ADR/` и `tasks/` для проектного контура.
- Реализована точка входа с пустым игровым экраном в portrait-only viewport и единым canvas.
- Добавлены hooks `window.render_game_to_text` и `window.advanceTime(ms)` для автоматизированного smoke-тестирования игрового рендера.
- Настроены scripts: `dev`, `build`, `preview`, `typecheck`, `test`, `test:watch`.
- Добавлен smoke unit test на контракт портретного viewport.
- Подготовлен README с фиксированной структурой директорий и инструкциями запуска.
