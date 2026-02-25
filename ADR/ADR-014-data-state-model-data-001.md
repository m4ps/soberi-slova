# ADR-014: Базовая версия state-модели и JSON snapshot-контракт

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [DATA]-[001]

## Контекст

Этап DATA-001 требует формализовать доменные сущности состояния игры в коде и закрепить воспроизводимый контракт сериализации/десериализации snapshot.

На момент завершения init-этапа state-модель была только в TECHSPEC, но отсутствовала как единый runtime-контракт в исходниках.

## Решение

1. Ввести отдельный доменный модуль `src/domain/GameState/index.ts` как source of truth для сущностей snapshot:
   - `GameState`, `LevelSession`, `HelpWindow`, `PendingOperation`, `LeaderboardSyncState`, `WordEntry`.
2. Зафиксировать runtime-конструкторы с fail-fast проверками типов на trust-boundary десериализации.
3. Принять JSON как канонический формат snapshot и добавить симметричные API:
   - `serializeGameState` / `deserializeGameState`;
   - `serializeWordEntry` / `deserializeWordEntry`.
4. Для bootstrap-инициализации state-модели установить безопасные default-значения:
   - `schemaVersion = 1`;
   - `stateVersion = 0`;
   - `pendingOps = []`.

## Последствия

- Доменная модель состояния теперь выражена в типах и runtime-конструкторах, а не только в документации.
- Snapshot round-trip становится проверяемым инвариантом (покрыт unit-тестами).
- Следующие задачи (`DATA-002+`) могут наращивать валидацию инвариантов и миграции поверх уже стабильного формата данных.
