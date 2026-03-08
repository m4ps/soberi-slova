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

## Command Bus Scope

- Routed command-contract совпадает с `TECHSPEC v1.1` и включает только:
  - `SubmitPath`
  - `RequestHint`
  - `RequestReshuffle`
  - `AcknowledgeAdResult`
  - `AcknowledgeWordSuccessAnimation`
  - `AcknowledgeLevelTransitionDone`
  - `RestoreSession`
  - `SyncLeaderboard`
- `RuntimeReady` и `Tick` остаются internal adapter/runtime commands:
  - они не публикуются как `application/command-routed`;
  - они используются только для bootstrap/diagnostic flow поверх того же command bus.

## Event Types

### Application events

- `application/runtime-ready`
  - payload: `{}`
  - scope: internal adapter/runtime flow
- `application/tick`
  - payload: `{ nowTs: number }`
  - scope: internal adapter/runtime flow
- `application/command-routed`
  - payload: `{ commandType: RoutedCommandType }`
  - scope: только routed команды из `TECHSPEC v1.1`
- `application/command-failed`
  - payload: `{ commandType: ApplicationCommand['type'], errorType: 'domainError' | 'infraError', code: string, retryable: boolean }`
  - scope: typed failure telemetry для `error-rate by code` без утечки произвольных error messages/PII

### Domain events (минимальный набор DATA-005)

- `domain/word-submitted`
  - payload: `{ commandType: 'SubmitPath', result: 'target' | 'bonus' | 'repeat' | 'invalid', normalizedWord: string | null, isSilent: boolean, levelClearAwarded: boolean, wordSuccessOperationId: string | null, scoreDelta: { wordScore: number, levelClearScore: number, totalScore: number }, progress: { foundTargets: number, totalTargets: number }, levelStatus: 'active' | 'completed' | 'reshuffling', allTimeScore: number, pathCells: GridCellRef[] }`
- `domain/word-success`
  - payload: `{ commandType: 'AcknowledgeWordSuccessAnimation', wordId: string, levelClearAwarded: boolean, scoreDelta: { wordScore: number, levelClearScore: number, totalScore: number }, allTimeScore: number }`
- `domain/level-clear`
  - payload: `{ commandType: 'AcknowledgeLevelTransitionDone' }`
- `domain/help`
  - payload:
    - `{ phase: 'requested', commandType: 'RequestHint' | 'RequestReshuffle', operationId: string, helpKind: 'hint' | 'reshuffle', isFreeAction: boolean, requiresAd: boolean, applied: boolean }`
    - `{ phase: 'ad-result', commandType: 'AcknowledgeAdResult', operationId: string, helpKind: 'hint' | 'reshuffle', outcome: 'reward' | 'close' | 'error' | 'no-fill', applied: boolean, durationMs: number | null, outcomeContext: string | null, cooldownApplied: boolean, cooldownDurationMs: number, toastMessage: string | null, technicalErrorPolicy: 'deterministic-reject-with-toast-and-cooldown' | 'deterministic-goodwill' | null }`
- `domain/help-action-failed`
  - payload: `{ commandType: 'RequestHint' | 'RequestReshuffle' | 'AcknowledgeAdResult', operationId: string, helpKind: 'hint' | 'reshuffle', source: 'free' | 'rewarded-ad', reason: string, levelId: string, stateVersion: number, allTimeScore: number, outcome: 'reward' | 'close' | 'error' | 'no-fill' | null, durationMs: number | null, outcomeContext: string | null, cooldownApplied: boolean, cooldownDurationMs: number, toastMessage: string | null, technicalErrorPolicy: 'deterministic-reject-with-toast-and-cooldown' | 'deterministic-goodwill' | null }`
- `domain/persistence`
  - payload: `{ commandType: 'RestoreSession', operation: 'restore-session', restored: boolean, levelRestored: boolean, source: 'local' | 'cloud' | 'none', localSnapshotAvailable: boolean, cloudSnapshotAvailable: boolean, cloudAllTimeScoreAvailable: boolean, restoredAllTimeScore: number, restoredStateVersion: number, restoredLevelId: string, restoredDisplayedTargetId: string | null, restoredHintPathProgress: number }`
- `domain/leaderboard-sync`
  - payload: `{ commandType: 'SyncLeaderboard', operation: 'sync-score', requestedScore: number }`
- `platform/leaderboard-sync-result`
  - payload: `{ trigger: 'auto' | 'manual', triggerEventType: 'domain/target-word-accepted' | 'domain/bonus-word-accepted' | 'domain/word-success' | 'domain/leaderboard-sync', score: number, status: 'success' | 'failed' | 'skipped', attempt: number, totalAttempts: number, reason: string | null }`
  - scope: platform outcome telemetry для `leaderboard sync success`

## Correlation Chain

Правило: `correlationId` из operation должен проходить от `application/command-routed` к связанному domain event.

Текущее покрытие:

- `SubmitPath`: `correlationId = wordSuccessOperationId` для финального target, иначе генерируется в application-слое.
- `RequestHint` / `RequestReshuffle`: `correlationId = HelpEconomy.operationId`.
- `AcknowledgeAdResult`: `correlationId = operationId` команды.
- `AcknowledgeWordSuccessAnimation`: `correlationId = operationId` команды.
- `AcknowledgeLevelTransitionDone`: `correlationId = operationId` команды.
- `RestoreSession` / `SyncLeaderboard`: `correlationId` генерируется в application-слое и используется и в routed, и в domain event.

Дополнительно для restore persistence payload:

- `RestoreSession` может принимать `payload` с persisted snapshot candidates:
  - `localSnapshot` / `cloudSnapshot`: `{ schemaVersion, capturedAt, gameStateSerialized, helpWindow }`;
  - `cloudAllTimeScore`: числовой score-hint из player stats;
- application/core restore применяет LWW merge и fallback на новый уровень при нересторибельной level-сессии.
- publish payload в `domain/persistence` теперь explicitly фиксирует:
  - был ли restore успешным (`restored`);
  - удалось ли восстановить сам level-context (`levelRestored`);
  - какой источник победил (`source`);
  - сохранились ли guided-state поля (`restoredDisplayedTargetId`, `restoredHintPathProgress`).

Дополнительно для `AcknowledgeAdResult`:

- `durationMs` фиксирует время ad-flow от запуска rewarded запроса до финального callback outcome;
- `outcomeContext` переносит технический reason при `error/no-fill`;
- `cooldownApplied/cooldownDurationMs` фиксируют применение временной блокировки help-кнопок;
- `toastMessage` формирует UI-сигнал для no-reward исходов (`close/error/no-fill`).
- `technicalErrorPolicy` делает product decision по `outcome=error` явным в telemetry; текущее значение runtime: `deterministic-reject-with-toast-and-cooldown`.

Дополнительно:

- `commands.dispatch(...)` возвращает `CommandAck` с `correlationId` для связывания application-command chain с telemetry.
- `PlatformYandex` сохраняет `correlationId` trigger-события при auto/manual leaderboard sync и публикует typed `platform/leaderboard-sync-result`.

## Telemetry Records

`Telemetry` adapter поверх event bus собирает derived typed records без PII:

- `telemetry/session-started`
  - payload: `{ sessionId, installId, sessionOrdinal, startedAt, retentionDay, firstSeenDayNumber }`
  - anonymous install identity хранится локально и нужна только для retention-аналитики (`D1/DN`)
- `telemetry/session-summary`
  - payload: session-level snapshot по `session length`, `helpActionShare`, `meanDisplayedTargetFindTimeMs`, `restore`, `ads`, `leaderboardSync`, `errorRateByCode`
- `telemetry/guardrail-snapshot`
  - payload: session-level statuses `ok | monitor | alert | insufficient-data` для product/technical guardrails

Telemetry adapter также держит live `getSessionSnapshot()` для debug/runtime inspection и не пишет PII в storage/payload.
