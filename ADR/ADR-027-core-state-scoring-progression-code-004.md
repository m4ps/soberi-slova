# ADR-027: CoreState scoring/progression state-first контракт

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [CODE]-[004]

## Контекст

Для задачи `CODE-004` требовалось реализовать единый доменный контур начисления очков и прогресса уровня:

- формулы очков PRD (`target`, `bonus`, `level clear`);
- идемпотентность начислений (ровно один раз на событие);
- `state-first` порядок для `SubmitPath` (сначала фиксация state, затем event/animation слой);
- запрет bonus-начислений после завершения уровня.

До изменения `CoreState` хранил только `runtimeMode` и не имел игрового состояния/механики scoring.

## Решение

1. Расширить `CoreState` до stateful модуля игрового snapshot:
   - хранить `GameState`;
   - возвращать `gameplay`-срез (`score`, `progress x/N`, `status`, found sets).
2. Добавить в `CoreState` единый `submitPath(pathCells)`:
   - path валидируется/классифицируется через `WordValidation`;
   - начисления применяются строго в state-first порядке.
3. Зафиксировать scoring-формулы PRD в одном месте:
   - `target: 10 + 2 * len`;
   - `bonus: 2 + len`;
   - `level clear: 30 + 5 * N`.
4. Ввести anti-exploit guards:
   - `repeat/invalid` не меняют state/score;
   - `level clear` начисляется только при переходе к последнему найденному target;
   - после `completed` новые bonus/target submit блокируются как no-op.
5. В `application` для `SubmitPath` сначала вызывать `coreState.submitPath`, затем публиковать `command-routed`, чтобы соблюсти state-first контракт end-to-end.

## Последствия

- Формулы очков и progression теперь централизованы в `CoreState`, без дублирования по слоям.
- Порядок `state -> events/animation` зафиксирован технически и покрыт интеграционным тестом.
- Закрыта возможность bonus-farm после completion на текущем уровне.
- Модуль готов к следующему этапу `CODE-005` (completion pipeline и авто-переход уровня) без пересмотра scoring-базы.
