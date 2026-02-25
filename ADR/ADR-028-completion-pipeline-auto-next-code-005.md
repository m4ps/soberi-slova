# ADR-028: Completion pipeline и auto-next через acknowledge-команды

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [CODE]-[005]

## Контекст

Для `CODE-005` требовалось реализовать финальный пайплайн завершения уровня в порядке PRD/TECHSPEC:

1. commit очков за последнее target-слово,
2. success animation,
3. progress `N/N` + ephemeral congrats,
4. начисление `level clear`,
5. full lock,
6. auto-next уровень.

До изменения `CoreState` начислял `level clear` сразу в `submitPath`, без разделения этапов на acknowledge и без детерминированного перехода `completed -> reshuffling -> active(next)`.

## Решение

1. Ввести completion state-machine в `CoreState`:
   - `submitPath` для финального target переводит уровень в `completed` и создаёт pending operation `word-success-animation`.
   - `acknowledgeWordSuccessAnimation(operationId)` начисляет `level clear` ровно один раз, включает `reshuffling` и создаёт pending operation `level-transition`.
   - `acknowledgeLevelTransitionDone(operationId)` завершает transition и переводит уровень в новый `active`.

2. Использовать `operationId` как ключ идемпотентности:
   - повторный ack по уже обработанному `operationId` становится no-op без изменения score/state;
   - предотвращается двойное начисление `level clear`.

3. Зафиксировать lock-контракт:
   - ввод разрешён только при `levelStatus=active`;
   - статусы `completed` и `reshuffling` считаются locked состояниями.

4. Для auto-next использовать `LevelGenerator`:
   - seed берётся как `currentSeed + 1`;
   - `recentTargetWords` прокидывается в генератор для anti-repeat;
   - новый уровень создаётся в status `active` без потери `allTimeScore`.

5. Синхронизировать application-layer:
   - `SubmitPath` использует `wordSuccessOperationId` как `correlationId` при наличии;
   - команды acknowledge сначала обновляют `CoreState`, затем публикуют event envelope.

## Последствия

- `level clear` начисляется строго один раз и только в корректной фазе pipeline.
- Переходный lock формализован технически (а не только UI-правилом).
- Переход уровня стал детерминированным и тестопригодным через команды acknowledge.
- Контур готов к следующему этапу визуализации (`RenderMotion`) без изменения доменного порядка операций.
