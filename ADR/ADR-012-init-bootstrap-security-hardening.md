# ADR-012: Security hardening bootstrap-контура INIT

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [INIT]-[093]

## Контекст

Init bootstrap-контур имел два security-риска:
1. При сбое в середине bootstrap оставался частично инициализированный runtime (подписки/lifecycle могли остаться активными).
2. `sdkScriptSrc` позволял задать произвольный источник SDK-скрипта, что увеличивало поверхность подмены загрузки.

Согласно TECHSPEC для интеграций требуется fail-closed поведение при недоступности SDK и политика zero-secrets/trusted runtime-поверхности.

## Решение

1. Принять fail-closed стратегию bootstrap:
   - при любой ошибке bootstrap фиксируется `bootstrap-failed`;
   - выполняется rollback подписок/игрового lifecycle;
   - частично поднятые модули очищаются и UI переводится в технический fail-state.
2. Ограничить runtime-загрузку SDK trusted source:
   - источник SDK для runtime-loader должен разрешаться только в same-origin `/sdk.js`.
3. Закрепить изменения contract-тестами `PlatformYandex`:
   - reject untrusted SDK source;
   - rollback состояния при падении dispatch `RuntimeReady`.

## Последствия

- Bootstrap больше не оставляет runtime в полурабочем состоянии после ошибки.
- Поверхность подмены SDK-скрипта в init-контуре существенно уменьшена.
- В случае недоступности SDK пользователь и тестовый контур получают явный технический fail-state вместо скрытого деградированного режима.
