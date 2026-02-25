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

- `domain/word-success`
  - payload: `{ commandType: 'AcknowledgeWordSuccessAnimation', wordId: string }`
- `domain/level-clear`
  - payload: `{ commandType: 'AcknowledgeLevelTransitionDone' }`
- `domain/help`
  - payload:
    - `{ phase: 'requested', commandType: 'RequestHint' | 'RequestReshuffle', helpKind: 'hint' | 'reshuffle', isFreeAction: boolean }`
    - `{ phase: 'ad-result', commandType: 'AcknowledgeAdResult', helpKind: 'hint' | 'reshuffle', outcome: 'reward' | 'close' | 'error' | 'no-fill' }`
- `domain/persistence`
  - payload: `{ commandType: 'RestoreSession', operation: 'restore-session' }`
- `domain/leaderboard-sync`
  - payload: `{ commandType: 'SyncLeaderboard', operation: 'sync-score' }`

## Correlation Chain

Правило: `correlationId` из operation должен проходить от `application/command-routed` к связанному domain event.

Текущее покрытие:

- `RequestHint` / `RequestReshuffle`: `correlationId = HelpEconomy.operationId`.
- `AcknowledgeAdResult`: `correlationId = operationId` команды.
- `AcknowledgeWordSuccessAnimation`: `correlationId = operationId` команды.
- `AcknowledgeLevelTransitionDone`: `correlationId = operationId` команды.
- `RestoreSession` / `SyncLeaderboard`: `correlationId` генерируется в application-слое и используется и в routed, и в domain event.

Дополнительно:

- `commands.dispatch(...)` возвращает `CommandAck` с `correlationId` для связывания application-command chain с telemetry.
