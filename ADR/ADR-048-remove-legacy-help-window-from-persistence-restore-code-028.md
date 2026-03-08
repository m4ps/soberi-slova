# ADR-048: CODE-028 — убрать legacy `helpWindow` из persistence/restore контракта

## Статус

Принято, 2026-03-08.

## Контекст

После `CODE-026` runtime уже живёт в paid-help-first модели, где источником истины для блокировки help-действий является текущий `helpLockState`.
При этом persistence и миграции всё ещё сохраняли legacy допущения:

- transport-envelope допускал sidecar `helpWindow`;
- `GameState` runtime-конструктор принимал legacy `helpWindow` как входной compatibility path;
- migration chain сохраняла `legacy-free-window` reasoning внутри live `helpLockState`.

Это расходилось с `TECHSPEC.md`, где best-effort restore ограничен `score + current level + displayed target + hint progress`, а transient free-timer state не входит в обязательный restore-контракт.

## Решение

1. `PersistedSessionSnapshot` сужается до `schemaVersion`, `capturedAt`, `gameStateSerialized`.
2. Новые persistence snapshot пишутся в transport schema `v2` без `helpWindow`.
3. `GameState` переводится на `schemaVersion=5`:
   - live `GameStateInput` больше не принимает legacy `helpWindow`;
   - `helpLockState` остаётся единственным runtime-представлением блокировки help.
4. Миграция `v4 -> v5` выполняет cleanup legacy help-shape:
   - удаляет `helpWindow` из snapshot;
   - санитизирует stale `helpLockState`, убирая `legacy-free-window` и прочие неактуальные legacy-состояния;
   - при отсутствии валидного current `helpLockState` выставляет нейтральное unlocked-состояние.
5. Restore старых envelope с `helpWindow` остаётся best-effort совместимым: sidecar допускается на входе, но полностью игнорируется при нормализации payload.

## Последствия

- Persistence и restore больше не зависят от legacy free-timer semantics.
- Backward compatibility сохраняется на migration boundary, а не в live runtime DTO.
- Старые snapshot безопасно поднимаются в текущую схему без возврата timer/help-window assumptions в runtime.
- ADR-044 и ADR-047 superseded частично: `helpWindow` больше не считается допустимым transport-контрактом для новых snapshot.
