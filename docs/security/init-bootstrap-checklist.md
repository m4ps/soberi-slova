# INIT Bootstrap Security Checklist

- Дата проверки: 2026-02-25
- Scope: `[INIT]-[093]`
- Проверяемая поверхность: загрузка YaGames SDK, bootstrap lifecycle, fallback/fail-state при недоступности SDK, отсутствие секретов в клиенте.

## Checklist

- [x] SDK загружается только из trusted source (`/sdk.js`, same-origin).
  - Статус: закрыто в `src/adapters/PlatformYandex/index.ts` (`assertTrustedSdkScriptSrc`).
- [x] При сбое bootstrap применяется fail-closed сценарий.
  - Статус: закрыто в `src/main.ts` (controlled cleanup + технический fail-state + безопасные hooks).
- [x] Lifecycle-состояние не остается в "грязном" состоянии после ошибки bootstrap.
  - Статус: закрыто в `src/adapters/PlatformYandex/index.ts` (rollback подписок/игрового lifecycle при `bootstrap-failed`).
- [x] События pause/resume обрабатываются только через зарегистрированные безопасные обработчики и корректно отписываются.
  - Статус: подтверждено тестами `tests/platform-yandex.adapter.test.ts`.
- [x] В init-коде нет hardcoded secrets.
  - Статус: проверено grep-сканом по `src/`, `config/`, `scripts/`, `tests/`, `.github/workflows`.
  - Признаков токенов/ключей/паролей не обнаружено.

## High-risk findings and fixes

1. Частично поднятый runtime после падения bootstrap мог оставлять активные lifecycle-ресурсы.
   - Fix: fail-closed cleanup (unsubscribe + gameplay stop + runtime dispose) и технический fail-state.
2. Возможность подменить источник SDK-скрипта через `sdkScriptSrc`.
   - Fix: жесткая валидация trusted same-origin `/sdk.js` для runtime-loader пути.

## Residual risks

- Автоматизация secret-scanning в CI остаётся отдельной задачей этапа security: `[SEC]-[004]` (уже есть в `BACKLOG.md`).
