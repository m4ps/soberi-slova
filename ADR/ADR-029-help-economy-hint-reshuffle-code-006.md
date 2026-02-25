# ADR-029: HelpEconomy free-window, hint progression и manual reshuffle

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [CODE]-[006]

## Контекст

Для `[CODE]-[006]` требовалось закрыть доменный контракт помощи:

1. единый `free-action` пул для `hint/reshuffle` с real-time окном `5 минут`,
2. shared lock на две help-кнопки и re-entrant-safe обработка,
3. списание free-action только после успешного применения эффекта помощи,
4. hint progression `2/3/4+` букв для самого лёгкого оставшегося target-слова,
5. manual reshuffle как полный reset текущего уровня.

До изменения `HelpEconomy` был заглушкой без таймера, lock-семантики и финализации операций, а `RequestHint/RequestReshuffle` в application-слое публиковали только событие без доменного эффекта.

## Решение

1. Реализовать stateful `HelpEconomy`:
   - окно `HELP_WINDOW_DURATION_MS = 5 * 60 * 1000`,
   - `pendingRequest` как единый lock для `hint/reshuffle`,
   - `requestHelp` возвращает один из режимов: `apply-now | await-ad | locked`,
   - `finalizePendingRequest(operationId, applied)` — единственная точка списания бесплатного действия.

2. Ввести в `CoreState` явный доменный API `applyHelp(kind, operationId)`:
   - `hint` выбирает самое лёгкое оставшееся target-слово (length-first), раскрывает `2/3/4+` букв и фиксирует progression в `LevelSession.meta`;
   - `reshuffle` выполняет полный reset уровня через `LevelGenerator`, очищая `foundTargets/foundBonuses`;
   - защита от повторного применения через idempotency guard по `operationId`.

3. Для manual reshuffle зафиксировать transition-порядок `active -> reshuffling -> active(next-level)`:
   - в `GameState` разрешён same-level переход `active -> reshuffling`,
   - смена `levelId` по-прежнему допускается только в `reshuffling -> active`.

4. В `application` оркестрировать help-flow state-first:
   - free-now: сначала `coreState.applyHelp`, затем `helpEconomy.finalizePendingRequest`;
   - ad-required: lock держится до `AcknowledgeAdResult`, после чего финализируется.

## Последствия

- Help-операции стали re-entrant-safe и детерминированными по `operationId`.
- Free-action не расходуется на неуспешных/прерванных операциях.
- Timer free-window корректно восстанавливается по реальному времени при повторном открытии игры (через `windowStartTs` + elapsed-time re-alignment).
- Ручной reshuffle теперь проходит через формализованный state transition-контракт без нарушения data-invariants.
