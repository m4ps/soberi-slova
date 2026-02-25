# ADR-020: Сужение snapshot-схемы до v1 scope

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [DATA]-[191]

## Контекст

Для DATA-191 требуется зафиксировать state-модель строго в пределах PRD v1 и исключить поля,
которые не являются обязательными для игрового цикла v1. В legacy payload могут встречаться
поля вне scope (`sessionScore`, `achievements`, `dailyQuests`, `tutorialTrace/tutorialTraces`).

Дополнительно поле `helpWindow.pendingHelpRequest.requestedAt` оказалось неиспользуемым в
актуальном контракте: для восстановления/идемпотентности достаточно `operationId` и `kind`.

## Решение

1. Поднять `GAME_STATE_SCHEMA_VERSION` до `2`.
2. Добавить миграцию `v1 -> v2`, которая:
   - удаляет out-of-scope legacy поля из snapshot;
   - удаляет deprecated `pendingHelpRequest.requestedAt`.
3. Упростить модель `PendingHelpRequest` до минимально необходимой формы:
   - `operationId`;
   - `kind`.
4. Обновить unit-тесты и документацию на новый schema-контракт.

## Последствия

- Snapshot-модель стала строже и лучше соответствует v1 scope.
- Legacy payload продолжает поддерживаться детерминированной миграцией (`v0 -> v1 -> v2`).
- Уменьшена поверхность лишних данных в persistence/restore контуре.
