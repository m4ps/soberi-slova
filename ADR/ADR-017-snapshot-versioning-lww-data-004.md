# ADR-017: Snapshot schema-versioning и LWW merge для restore

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [DATA]-[004]

## Контекст

Для этапа DATA-004 требуется обеспечить детерминированное восстановление состояния из snapshot и согласованное разрешение конфликтов local/cloud данных по контракту TECHSPEC.

Обязательные ограничения:
- миграции должны быть schema-driven и идти строго по цепочке `vN -> vN+1`;
- merge local/cloud должен соответствовать LWW-политике:
  1. сначала `stateVersion`;
  2. затем `updatedAt`;
  3. при полном равенстве — приоритет local snapshot;
- восстановление должно быть воспроизводимым и fail-fast на malformed/unsupported payload.

## Решение

1. Добавить migration-aware API в `GameState`:
   - `migrateGameStateSnapshot(snapshot)`;
   - `deserializeGameStateWithMigrations(serialized)`.
2. Зафиксировать deterministic migration chain с явными step'ами:
   - текущий шаг `v0 -> v1`:
     - проставляет `schemaVersion=1`;
     - заполняет `stateVersion=0`, если поле отсутствовало;
     - нормализует `pendingOps=[]`, если поле отсутствовало.
3. Ввести `resolveLwwSnapshot(local, cloud)` в доменном слое, принимающий как typed state, так и serialized snapshot, и выполняющий merge строго по LWW контракту.
4. Snapshot с `schemaVersion` выше текущей версии схемы отклонять как unsupported future schema для fail-closed поведения restore.

## Последствия

- Restore получает детерминированный и тестируемый pipeline миграций без скрытых неявных преобразований.
- Local/cloud merge становится формально определённым и воспроизводимым во всех tie-break сценариях.
- Добавление следующих версий схемы не требует изменения текущих step'ов: достаточно добавить новый deterministic шаг `vN -> vN+1`.
- Будущие snapshot'ы (более новая schema) отклоняются явно, что предотвращает silent corruption и вынуждает контролируемое обновление migration chain.
