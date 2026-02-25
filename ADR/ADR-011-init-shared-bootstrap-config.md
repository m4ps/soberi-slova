# ADR-011: Единый источник bootstrap-констант и dev-proxy конфигурации

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [INIT]-[092]

## Контекст

В init-слое были дубли:
- строковые литералы YaGames lifecycle и SDK bootstrap-параметров одновременно в runtime-коде и тестах;
- dev/prod proxy-параметры дублировались в `package.json` scripts;
- порты `vite` (`server`/`preview`) и proxy задавались в разных местах без единой точки правды.

Это создавало риск расхождения конфигураций при последующих изменениях.

## Решение

1. Ввести `src/config/platform-yandex.ts` как единый источник для:
   - `YANDEX_SDK_SCRIPT_SRC`,
   - `YANDEX_SDK_SCRIPT_MARKER_ATTR`,
   - `YANDEX_SDK_SCRIPT_LOAD_TIMEOUT_MS`,
   - `YANDEX_LIFECYCLE_EVENTS` и типа `YandexLifecycleEvent`.
2. Перевести `src/adapters/PlatformYandex/index.ts` и `tests/platform-yandex.adapter.test.ts`
   на использование этих shared-констант.
3. Вынести порты dev/preview/proxy в `config/runtime-ports.json`.
4. Добавить единый runner `scripts/run-sdk-dev-proxy.mjs` и использовать его в `package.json`
   scripts `dev:proxy` и `dev:proxy:prod`.
5. Перевести `vite.config.ts` на чтение `config/runtime-ports.json`.

## Последствия

- Конфигурация bootstrap-контура централизована, риск конфликтующих значений снижен.
- Изменение портов или SDK bootstrap-констант теперь выполняется в одном месте.
- Runtime-код и контрактные тесты используют одинаковые lifecycle значения.
- Поведение приложения и интерфейсы команд не изменены; изменение носит структурный характер.
