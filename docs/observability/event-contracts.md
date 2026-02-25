# Event Contracts (DATA-005)

Документ фиксирует контракт внутренних событий приложения для telemetry/observability.

## Event Envelope

Все события публикуются через единый versioned envelope:

```ts
{
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: number;
  correlationId: string;
  payload: Record<string, unknown>;
}
```

Инварианты:

- `eventId` уникален в рамках процесса приложения.
- `eventVersion` versioned per event-type (для текущих событий v1 = `1`).
- `occurredAt` — timestamp события в миллисекундах.
- `correlationId` обязателен всегда; если команда не передала внешний operation id, он генерируется внутри application-слоя.

## Event Types

### Application events

- `application/runtime-ready`
  - payload: `{}`
- `application/tick`
  - payload: `{ nowTs: number }`
- `application/command-routed`
  - payload: `{ commandType: RoutedCommandType }`

### Domain events (минимальный набор DATA-005)

- `domain/word-submitted`
  - payload: `{ commandType: 'SubmitPath', result: 'target' | 'bonus' | 'repeat' | 'invalid', normalizedWord: string | null, isSilent: boolean, levelClearAwarded: boolean, wordSuccessOperationId: string | null, scoreDelta: { wordScore: number, levelClearScore: number, totalScore: number }, progress: { foundTargets: number, totalTargets: number }, levelStatus: 'active' | 'completed' | 'reshuffling', allTimeScore: number, pathCells: GridCellRef[] }`
- `domain/word-success`
  - payload: `{ commandType: 'AcknowledgeWordSuccessAnimation', wordId: string }`
- `domain/level-clear`
  - payload: `{ commandType: 'AcknowledgeLevelTransitionDone' }`
- `domain/help`
  - payload:
    - `{ phase: 'requested', commandType: 'RequestHint' | 'RequestReshuffle', operationId: string, helpKind: 'hint' | 'reshuffle', isFreeAction: boolean, requiresAd: boolean, applied: boolean }`
    - `{ phase: 'ad-result', commandType: 'AcknowledgeAdResult', operationId: string, helpKind: 'hint' | 'reshuffle', outcome: 'reward' | 'close' | 'error' | 'no-fill', applied: boolean, durationMs: number | null, outcomeContext: string | null, cooldownApplied: boolean, cooldownDurationMs: number, toastMessage: string | null }`
- `domain/persistence`
  - payload: `{ commandType: 'RestoreSession', operation: 'restore-session' }`
- `domain/leaderboard-sync`
  - payload: `{ commandType: 'SyncLeaderboard', operation: 'sync-score' }`

## Correlation Chain

Правило: `correlationId` из operation должен проходить от `application/command-routed` к связанному domain event.

Текущее покрытие:

- `SubmitPath`: `correlationId = wordSuccessOperationId` для финального target, иначе генерируется в application-слое.
- `RequestHint` / `RequestReshuffle`: `correlationId = HelpEconomy.operationId`.
- `AcknowledgeAdResult`: `correlationId = operationId` команды.
- `AcknowledgeWordSuccessAnimation`: `correlationId = operationId` команды.
- `AcknowledgeLevelTransitionDone`: `correlationId = operationId` команды.
- `RestoreSession` / `SyncLeaderboard`: `correlationId` генерируется в application-слое и используется и в routed, и в domain event.

Дополнительно для `AcknowledgeAdResult`:

- `durationMs` фиксирует время ad-flow от запуска rewarded запроса до финального callback outcome;
- `outcomeContext` переносит технический reason при `error/no-fill`;
- `cooldownApplied/cooldownDurationMs` фиксируют применение временной блокировки help-кнопок;
- `toastMessage` формирует UI-сигнал для no-reward исходов (`close/error/no-fill`).

Дополнительно:

- `commands.dispatch(...)` возвращает `CommandAck` с `correlationId` для связывания application-command chain с telemetry.
