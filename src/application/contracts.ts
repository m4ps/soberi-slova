import type { CoreStateModule, CoreStateSnapshot } from '../domain/CoreState';
import type { HelpEconomyModule, HelpKind, HelpWindowState } from '../domain/HelpEconomy';

export interface DomainModules {
  readonly coreState: CoreStateModule;
  readonly helpEconomy: HelpEconomyModule;
}

export interface GridCellRef {
  readonly row: number;
  readonly col: number;
}

export type RewardedAdOutcome = 'reward' | 'close' | 'error' | 'no-fill';

export type ApplicationCommand =
  | { readonly type: 'RuntimeReady' }
  | { readonly type: 'SubmitPath'; readonly pathCells: readonly GridCellRef[] }
  | { readonly type: 'RequestHint' }
  | { readonly type: 'RequestReshuffle' }
  | {
      readonly type: 'AcknowledgeAdResult';
      readonly helpType: HelpKind;
      readonly outcome: RewardedAdOutcome;
      readonly operationId: string;
      readonly durationMs?: number;
      readonly outcomeContext?: string | null;
    }
  | {
      readonly type: 'AcknowledgeWordSuccessAnimation';
      readonly wordId: string;
      readonly operationId: string;
    }
  | {
      readonly type: 'AcknowledgeLevelTransitionDone';
      readonly operationId: string;
    }
  | { readonly type: 'Tick'; readonly nowTs: number }
  | { readonly type: 'RestoreSession' }
  | { readonly type: 'SyncLeaderboard' };

export type ApplicationQuery =
  | { readonly type: 'GetCoreState' }
  | { readonly type: 'GetHelpWindowState' };

export interface ApplicationError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface ApplicationOkResult<TValue> {
  readonly type: 'ok';
  readonly value: TValue;
}

export interface ApplicationDomainErrorResult {
  readonly type: 'domainError';
  readonly error: ApplicationError;
}

export interface ApplicationInfraErrorResult {
  readonly type: 'infraError';
  readonly error: ApplicationError;
}

export type ApplicationResult<TValue> =
  | ApplicationOkResult<TValue>
  | ApplicationDomainErrorResult
  | ApplicationInfraErrorResult;

export interface CommandAck {
  readonly commandType: ApplicationCommand['type'];
  readonly handledAt: number;
  readonly correlationId: string;
}

export interface ApplicationCommandBus {
  dispatch: (command: ApplicationCommand) => ApplicationResult<CommandAck>;
}

export type ApplicationQueryPayload<TQuery extends ApplicationQuery> = TQuery extends {
  readonly type: 'GetCoreState';
}
  ? CoreStateSnapshot
  : TQuery extends { readonly type: 'GetHelpWindowState' }
    ? HelpWindowState
    : never;

export interface ApplicationQueryBus {
  execute: <TQuery extends ApplicationQuery>(
    query: TQuery,
  ) => ApplicationResult<ApplicationQueryPayload<TQuery>>;
}

export interface ApplicationReadModel {
  getCoreState: () => CoreStateSnapshot;
  getHelpWindowState: () => HelpWindowState;
}

export type RoutedCommandType = Exclude<ApplicationCommand['type'], 'RuntimeReady' | 'Tick'>;

export interface EventEnvelope<TEventType extends string, TPayload> {
  readonly eventId: string;
  readonly eventType: TEventType;
  readonly eventVersion: number;
  readonly occurredAt: number;
  readonly correlationId: string;
  readonly payload: TPayload;
}

export type RuntimeReadyEvent = EventEnvelope<'application/runtime-ready', Record<string, never>>;
export type TickEvent = EventEnvelope<'application/tick', { readonly nowTs: number }>;
export type CommandRoutedEvent = EventEnvelope<
  'application/command-routed',
  { readonly commandType: RoutedCommandType }
>;

export type WordSuccessEvent = EventEnvelope<
  'domain/word-success',
  {
    readonly commandType: 'AcknowledgeWordSuccessAnimation';
    readonly wordId: string;
  }
>;

export type LevelClearEvent = EventEnvelope<
  'domain/level-clear',
  {
    readonly commandType: 'AcknowledgeLevelTransitionDone';
  }
>;

export type HelpEvent = EventEnvelope<
  'domain/help',
  | {
      readonly phase: 'requested';
      readonly commandType: 'RequestHint' | 'RequestReshuffle';
      readonly operationId: string;
      readonly helpKind: HelpKind;
      readonly isFreeAction: boolean;
      readonly requiresAd: boolean;
      readonly applied: boolean;
    }
  | {
      readonly phase: 'ad-result';
      readonly commandType: 'AcknowledgeAdResult';
      readonly operationId: string;
      readonly helpKind: HelpKind;
      readonly outcome: RewardedAdOutcome;
      readonly applied: boolean;
      readonly durationMs: number | null;
      readonly outcomeContext: string | null;
      readonly cooldownApplied: boolean;
      readonly cooldownDurationMs: number;
      readonly toastMessage: string | null;
    }
>;

export type PersistenceEvent = EventEnvelope<
  'domain/persistence',
  {
    readonly commandType: 'RestoreSession';
    readonly operation: 'restore-session';
  }
>;

export type LeaderboardSyncEvent = EventEnvelope<
  'domain/leaderboard-sync',
  {
    readonly commandType: 'SyncLeaderboard';
    readonly operation: 'sync-score';
  }
>;

export type ApplicationEvent =
  | RuntimeReadyEvent
  | TickEvent
  | CommandRoutedEvent
  | WordSuccessEvent
  | LevelClearEvent
  | HelpEvent
  | PersistenceEvent
  | LeaderboardSyncEvent;

export type ApplicationEventListener = (event: ApplicationEvent) => void;

export interface ApplicationEventBus {
  publish: (event: ApplicationEvent) => void;
  subscribe: (listener: ApplicationEventListener) => () => void;
}

export interface ApplicationLayer {
  readonly commands: ApplicationCommandBus;
  readonly queries: ApplicationQueryBus;
  readonly readModel: ApplicationReadModel;
  readonly events: ApplicationEventBus;
}
