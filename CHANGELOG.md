# CHANGELOG

## 2026-02-24

### [INIT]-[004] Platform bootstrap YaGames SDK + dev-proxy
- `PlatformYandex` переведён со stub на рабочий адаптер: добавлены `YaGames.init()`, `LoadingAPI.ready()`, `GameplayAPI.start()/stop()` и обработчики `game_api_pause`/`game_api_resume`.
- Добавлен структурированный lifecycle-log платформенного адаптера с наблюдаемостью через `window.render_game_to_text`.
- Усилен bootstrap-контур: `RuntimeReady` теперь dispatch-ится только после успешной инициализации SDK lifecycle.
- Добавлен контрактный тест `tests/platform-yandex.adapter.test.ts` (bootstrap, pause/resume wiring, dispose/unsubscribe, ошибка при отсутствии SDK).
- Добавлена локальная инфраструктура запуска через `@yandex-games/sdk-dev-proxy` (`dev:proxy`, `dev:proxy:prod`) и обновлён README с инструкциями для dev/draft/prod режимов.

### [INIT]-[003] Command bus, Result Envelopes и доменные ошибки
- В application-слое введён единый typed bus с контрактами `ApplicationCommand` и `ApplicationQuery`.
- Добавлены обязательные команды v1 из TECHSPEC: `SubmitPath`, `RequestHint`, `RequestReshuffle`, `AcknowledgeAdResult`, `AcknowledgeWordSuccessAnimation`, `AcknowledgeLevelTransitionDone`, `Tick`, `RestoreSession`, `SyncLeaderboard`.
- Реализован единый `Result envelope` формата `ok | domainError | infraError` и унифицированный `Error envelope` `{ code, message, retryable, context }`.
- Добавлен query-bus (`GetCoreState`, `GetHelpWindowState`) и связанный read-model поверх него.
- Обновлены адаптеры `InputPath`, `PlatformYandex`, `Persistence` на новые команды/queries bus-контракта.
- Добавлен интеграционный smoke-тест `tests/application-command-bus.smoke.test.ts`, проверяющий маршрутизацию обязательных команд и корректность error envelope.

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
