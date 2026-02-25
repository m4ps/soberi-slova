# GameState Schema (DATA-001)

Документ фиксирует актуальную v1-схему доменных сущностей состояния игры, реализованную в `src/domain/GameState/index.ts`.

## Версионирование snapshot

- `schemaVersion` — версия схемы snapshot (по умолчанию `1`).
- `stateVersion` — версия состояния для LWW/конфликтов (по умолчанию `0`).
- `updatedAt` — timestamp последнего изменения состояния (ms).

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
- `requestedAt: number`

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
- Сериализация:
  - `serializeGameState` / `deserializeGameState`
  - `serializeWordEntry` / `deserializeWordEntry`

## Контракт сериализации

- Snapshot сохраняется/восстанавливается через JSON.
- Десериализация fail-fast: malformed payload вызывает ошибку с префиксом `[game-state]`.
- Round-trip без потери структуры подтверждён unit-тестом `tests/game-state.model.test.ts`.
