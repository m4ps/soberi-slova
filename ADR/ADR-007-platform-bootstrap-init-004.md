# ADR-007: Platform bootstrap через YaGames SDK и lifecycle wiring для INIT-004

- Статус: accepted
- Дата: 2026-02-24
- Связанные задачи: [INIT]-[004]

## Контекст

Слой `PlatformYandex` оставался заглушкой, из-за чего bootstrap не покрывал обязательные требования TECHSPEC:
`YaGames.init()`, `LoadingAPI.ready()`, `GameplayAPI.start()/stop()` и обработку `game_api_pause/game_api_resume`.
Также для локальной проверки нужен воспроизводимый цикл через `@yandex-games/sdk-dev-proxy`.

## Решение

1. Реализовать `PlatformYandex` как рабочий runtime-адаптер:
   - инициализация SDK через `YaGames.init()`;
   - вызовы `LoadingAPI.ready()` и `GameplayAPI.start()` в bootstrap;
   - подписки на `game_api_pause`/`game_api_resume` с `GameplayAPI.stop()`/`start()`;
   - корректный `dispose()` с отпиской от lifecycle-событий.
2. Оставить fail-fast стратегию при недоступном SDK: bootstrap не маскирует отсутствие платформы и возвращает явную ошибку с инструкцией запускать через dev-proxy/draft runtime.
3. Добавить структурированный lifecycle-log адаптера и сделать его доступным в smoke-наблюдаемости (`render_game_to_text`), чтобы проверка цепочки инициализации была детерминированной.
4. Зафиксировать локальный proxy-цикл в npm scripts и README для dev/prod-like проверки.

## Последствия

- Платформенный bootstrap теперь соответствует контрактам TECHSPEC для init-этапа.
- Lifecycle события платформы наблюдаемы в тестах и smoke-прогонах без ad-hoc debug кода.
- Локальная проверка через `sdk-dev-proxy` формализована и повторяема.
