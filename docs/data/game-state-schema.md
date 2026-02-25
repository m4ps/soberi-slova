# GameState Schema (DATA-001 / DATA-002 / DATA-004)

Документ фиксирует актуальную v1-схему доменных сущностей состояния игры, реализованную в `src/domain/GameState/index.ts`.

## Версионирование snapshot

- `schemaVersion` — версия схемы snapshot (по умолчанию `2`).
- `stateVersion` — версия состояния для LWW/конфликтов (по умолчанию `0`).
- `updatedAt` — timestamp последнего изменения состояния (ms).
- Для legacy payload без `schemaVersion` применяется миграционная точка входа `schemaVersion=0`.

## Сущности

### `GameState`

- `schemaVersion: number`
- `stateVersion: number`
- `updatedAt: number`
- `allTimeScore: number`
- `currentLevelSession: LevelSession`
- `helpWindow: HelpWindow`
- `pendingOps: PendingOperation[]`
- `leaderboardSync: LeaderboardSyncState`

### `LevelSession`

- `levelId: string`
- `grid: string[]`
- `targetWords: string[]`
- `foundTargets: string[]`
- `foundBonuses: string[]`
- `status: 'active' | 'completed' | 'reshuffling'`
- `seed: number`
- `meta: Record<string, string | number | boolean | null>`

### `HelpWindow`

- `windowStartTs: number`
- `freeActionAvailable: boolean`
- `pendingHelpRequest: PendingHelpRequest | null`

### `PendingHelpRequest`

- `operationId: string`
- `kind: 'hint' | 'reshuffle'`

### `PendingOperation`

- `operationId: string`
- `kind: 'help-hint' | 'help-reshuffle' | 'word-success-animation' | 'level-transition' | 'restore-session' | 'leaderboard-sync'`
- `status: 'pending' | 'applied' | 'failed'`
- `retryCount: number`
- `createdAt: number`
- `updatedAt: number`

### `LeaderboardSyncState`

- `lastSubmittedScore: number`
- `lastAckScore: number`
- `lastSubmitTs: number`

### `WordEntry`

- `id: number`
- `bare: string`
- `rank: number`
- `type: string`
- `normalized: string`

## Runtime API

- Конструкторы:
  - `createGameState`, `createLevelSession`, `createHelpWindow`, `createPendingHelpRequest`
  - `createPendingOperation`, `createLeaderboardSyncState`, `createWordEntry`
- Переходы уровня:
  - `assertLevelSessionTransition(previousSession, nextSession)`
- Ошибки:
  - `GameStateDomainError` + `isGameStateDomainError`
- Сериализация:
  - `serializeGameState` / `deserializeGameState`
  - `deserializeGameStateWithMigrations` / `migrateGameStateSnapshot`
  - `serializeWordEntry` / `deserializeWordEntry`
- Конфликт-резолвер:
  - `resolveLwwSnapshot(localSnapshot, cloudSnapshot)`

## Runtime Invariants (DATA-002)

- Grid строго `5x5` (`25` ячеек).
- Для `grid`, `targetWords`, `foundTargets`, `foundBonuses` допустима только нижняя кириллица (`а-я`, `ё`), без латиницы/цифр/спецсимволов.
- `targetWords` содержит от `3` до `7` слов.
- Дубли в `targetWords`, `foundTargets`, `foundBonuses` запрещены.
- `foundTargets` может содержать только слова из `targetWords`.
- `foundBonuses` не может содержать слова из `targetWords`.
- `foundTargets` и `foundBonuses` не пересекаются.
- Переходы статуса однонаправленные:
  - в рамках одного уровня: `active -> active|completed`, `completed -> completed|reshuffling`, `reshuffling -> reshuffling`;
  - смена `levelId` разрешена только в переходе `reshuffling -> active` (следующий уровень).

## Контракт сериализации

- Snapshot сохраняется/восстанавливается через JSON.
- Десериализация и инвариантная валидация fail-fast: malformed payload/invalid state вызывает `GameStateDomainError` с префиксом `[game-state]`, `retryable=false` и кодом ошибки.
- Round-trip без потери структуры подтверждён unit-тестом `tests/game-state.model.test.ts`.

## Миграции и LWW merge (DATA-004)

- Миграции выполняются строго детерминированной цепочкой `vN -> vN+1`.
- Текущая цепочка:
  - `v0 -> v1`: выставляет `schemaVersion=1`, заполняет `stateVersion=0` при отсутствии, нормализует `pendingOps=[]` при отсутствии.
  - `v1 -> v2`: удаляет legacy/out-of-scope поля (`sessionScore`, `achievements`, `dailyQuests`, `tutorialTrace/tutorialTraces`) и очищает `pendingHelpRequest` от deprecated `requestedAt`.
- Snapshot с `schemaVersion > 1` отклоняется как unsupported future schema.
- `resolveLwwSnapshot` выбирает winner по контракту TECHSPEC:
  1. Больше `stateVersion` выигрывает.
  2. При равенстве `stateVersion` выигрывает больше `updatedAt`.
  3. При полном равенстве (`stateVersion` и `updatedAt`) приоритет у local snapshot.
- Оба входа (`local`, `cloud`) проходят через нормализацию/валидацию snapshot перед сравнением, включая миграции.
