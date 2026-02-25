# GameState Schema (DATA-001 / DATA-002)

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
- Переходы уровня:
  - `assertLevelSessionTransition(previousSession, nextSession)`
- Ошибки:
  - `GameStateDomainError` + `isGameStateDomainError`
- Сериализация:
  - `serializeGameState` / `deserializeGameState`
  - `serializeWordEntry` / `deserializeWordEntry`

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
