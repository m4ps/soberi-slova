import type {
  CoreStateHelpApplyResultReason,
  CoreStateHelpEffect,
  CoreStateModule,
  CoreStateSnapshot,
} from '../domain/CoreState';
import type { HelpEconomyModule, HelpKind, HelpWindowState } from '../domain/HelpEconomy';
import type { HelpAdOutcome, HelpAdTechnicalErrorPolicy } from '../config/help-ad-policy';

export interface DomainModules {
  readonly coreState: CoreStateModule;
  readonly helpEconomy: HelpEconomyModule;
}

export interface GridCellRef {
  readonly row: number;
  readonly col: number;
}

export type RewardedAdOutcome = HelpAdOutcome;

export interface PersistedHelpWindowSnapshot {
  readonly windowStartTs: number;
  readonly freeActionAvailable: boolean;
}

export interface PersistedSessionSnapshot {
  readonly schemaVersion: number;
  readonly capturedAt: number;
  readonly gameStateSerialized: string | null;
  readonly helpWindow: PersistedHelpWindowSnapshot | null;
}

export interface RestoreSessionPayload {
  readonly localSnapshot: PersistedSessionSnapshot | null;
  readonly cloudSnapshot: PersistedSessionSnapshot | null;
  readonly cloudAllTimeScore: number | null;
}

export const TECHSPEC_V1_1_COMMAND_TYPES = [
  'SubmitPath',
  'RequestHint',
  'RequestReshuffle',
  'AcknowledgeAdResult',
  'AcknowledgeWordSuccessAnimation',
  'AcknowledgeLevelTransitionDone',
  'RestoreSession',
  'SyncLeaderboard',
] as const;

export type TechspecCommandType = (typeof TECHSPEC_V1_1_COMMAND_TYPES)[number];

export const INTERNAL_ADAPTER_COMMAND_TYPES = ['RuntimeReady', 'Tick'] as const;

export type InternalAdapterCommandType = (typeof INTERNAL_ADAPTER_COMMAND_TYPES)[number];

// TECHSPEC v1.1 public command contract exposed to gameplay/application adapters.
export type TechspecApplicationCommand =
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
  | { readonly type: 'RestoreSession'; readonly payload?: RestoreSessionPayload }
  | { readonly type: 'SyncLeaderboard' };

// Internal runtime commands are kept as adapter-only flow and are excluded from TECHSPEC routing.
export type InternalAdapterCommand =
  | { readonly type: 'RuntimeReady' }
  | { readonly type: 'Tick'; readonly nowTs: number };

export type ApplicationCommand = TechspecApplicationCommand | InternalAdapterCommand;

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

export type RoutedCommandType = TechspecCommandType;

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

export type WordSubmittedEvent = EventEnvelope<
  'domain/word-submitted',
  {
    readonly commandType: 'SubmitPath';
    readonly result: 'target' | 'bonus' | 'repeat' | 'invalid';
    readonly normalizedWord: string | null;
    readonly isSilent: boolean;
    readonly levelClearAwarded: boolean;
    readonly wordSuccessOperationId: string | null;
    readonly scoreDelta: {
      readonly wordScore: number;
      readonly levelClearScore: number;
      readonly totalScore: number;
    };
    readonly progress: {
      readonly foundTargets: number;
      readonly totalTargets: number;
    };
    readonly levelStatus: 'active' | 'completed' | 'reshuffling';
    readonly allTimeScore: number;
    readonly pathCells: readonly GridCellRef[];
  }
>;

export type DisplayedTargetChangedCommandType =
  | 'SubmitPath'
  | 'RequestHint'
  | 'RequestReshuffle'
  | 'AcknowledgeAdResult'
  | 'RestoreSession'
  | 'AcknowledgeLevelTransitionDone';

export type DisplayedTargetChangedReason =
  | 'target-accepted'
  | 'hint-applied'
  | 'reshuffle-applied'
  | 'restore-session'
  | 'level-transition';

export type HelpActionCommandType = 'RequestHint' | 'RequestReshuffle' | 'AcknowledgeAdResult';

export type HelpActionSource = 'free' | 'rewarded-ad';

export type HelpActionFailureReason =
  | CoreStateHelpApplyResultReason
  | 'ad-close'
  | 'ad-error'
  | 'ad-no-fill'
  | 'ad-reward-not-applied';

export type TargetWordAcceptedEvent = EventEnvelope<
  'domain/target-word-accepted',
  {
    readonly commandType: 'SubmitPath';
    readonly targetWord: string;
    readonly pathCells: readonly GridCellRef[];
    readonly wordSuccessOperationId: string | null;
    readonly levelCompleted: boolean;
    readonly levelId: string;
    readonly stateVersion: number;
    readonly displayedTargetId: string | null;
    readonly scoreDelta: {
      readonly wordScore: number;
      readonly levelClearScore: number;
      readonly totalScore: number;
    };
    readonly progress: {
      readonly foundTargets: number;
      readonly totalTargets: number;
    };
    readonly allTimeScore: number;
  }
>;

export type BonusWordAcceptedEvent = EventEnvelope<
  'domain/bonus-word-accepted',
  {
    readonly commandType: 'SubmitPath';
    readonly bonusWord: string;
    readonly pathCells: readonly GridCellRef[];
    readonly levelId: string;
    readonly stateVersion: number;
    readonly displayedTargetId: string | null;
    readonly scoreDelta: {
      readonly wordScore: number;
      readonly levelClearScore: number;
      readonly totalScore: number;
    };
    readonly progress: {
      readonly foundTargets: number;
      readonly totalTargets: number;
    };
    readonly allTimeScore: number;
  }
>;

export type ProgressBarFillRequestedEvent = EventEnvelope<
  'domain/progress-bar-fill-requested',
  {
    readonly commandType: 'SubmitPath';
    readonly targetWord: string;
    readonly pathCells: readonly GridCellRef[];
    readonly levelId: string;
    readonly stateVersion: number;
    readonly progress: {
      readonly previousFoundTargets: number;
      readonly foundTargets: number;
      readonly totalTargets: number;
    };
    readonly allTimeScore: number;
    readonly levelCompleted: boolean;
  }
>;

export type DisplayedTargetChangedEvent = EventEnvelope<
  'domain/displayed-target-changed',
  {
    readonly commandType: DisplayedTargetChangedCommandType;
    readonly reason: DisplayedTargetChangedReason;
    readonly previousLevelId: string;
    readonly nextLevelId: string;
    readonly previousTargetWordId: string | null;
    readonly nextTargetWordId: string | null;
    readonly previousHintPathProgress: number;
    readonly nextHintPathProgress: number;
    readonly stateVersion: number;
    readonly progress: {
      readonly foundTargets: number;
      readonly totalTargets: number;
    };
  }
>;

export type HintPathProgressAdvancedEvent = EventEnvelope<
  'domain/hint-path-progress-advanced',
  {
    readonly commandType: 'RequestHint' | 'AcknowledgeAdResult';
    readonly operationId: string;
    readonly targetWord: string;
    readonly revealCount: number;
    readonly revealedLetters: string;
    readonly revealedPathCells: readonly GridCellRef[];
    readonly levelId: string;
    readonly stateVersion: number;
  }
>;

export type LevelCompletedEvent = EventEnvelope<
  'domain/level-completed',
  {
    readonly commandType: 'SubmitPath';
    readonly levelId: string;
    readonly completedWord: string;
    readonly wordSuccessOperationId: string;
    readonly stateVersion: number;
    readonly displayedTargetId: string | null;
    readonly scoreDelta: {
      readonly wordScore: number;
      readonly levelClearScore: number;
      readonly totalScore: number;
    };
    readonly progress: {
      readonly foundTargets: number;
      readonly totalTargets: number;
    };
    readonly allTimeScore: number;
  }
>;

export type HelpActionAppliedEvent = EventEnvelope<
  'domain/help-action-applied',
  {
    readonly commandType: HelpActionCommandType;
    readonly operationId: string;
    readonly helpKind: HelpKind;
    readonly source: HelpActionSource;
    readonly levelId: string;
    readonly stateVersion: number;
    readonly allTimeScore: number;
    readonly effect: CoreStateHelpEffect;
  }
>;

export type HelpActionFailedEvent = EventEnvelope<
  'domain/help-action-failed',
  {
    readonly commandType: HelpActionCommandType;
    readonly operationId: string;
    readonly helpKind: HelpKind;
    readonly source: HelpActionSource;
    readonly reason: HelpActionFailureReason;
    readonly levelId: string;
    readonly stateVersion: number;
    readonly allTimeScore: number;
    readonly outcome: RewardedAdOutcome | null;
    readonly durationMs: number | null;
    readonly outcomeContext: string | null;
    readonly cooldownApplied: boolean;
    readonly cooldownDurationMs: number;
    readonly toastMessage: string | null;
    readonly technicalErrorPolicy: HelpAdTechnicalErrorPolicy | null;
  }
>;

export type WordSuccessEvent = EventEnvelope<
  'domain/word-success',
  {
    readonly commandType: 'AcknowledgeWordSuccessAnimation';
    readonly wordId: string;
    readonly levelClearAwarded: boolean;
    readonly scoreDelta: {
      readonly wordScore: number;
      readonly levelClearScore: number;
      readonly totalScore: number;
    };
    readonly allTimeScore: number;
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
      readonly technicalErrorPolicy: HelpAdTechnicalErrorPolicy | null;
    }
>;

export type PersistenceEvent = EventEnvelope<
  'domain/persistence',
  {
    readonly commandType: 'RestoreSession';
    readonly operation: 'restore-session';
  }
>;

export type StatePersistedTriggerEventType =
  | 'domain/persistence'
  | 'domain/target-word-accepted'
  | 'domain/bonus-word-accepted'
  | 'domain/level-completed'
  | 'domain/help-action-applied'
  | 'domain/help-action-failed'
  | 'domain/word-success'
  | 'domain/level-clear';

export type StatePersistedEvent = EventEnvelope<
  'domain/state-persisted',
  {
    readonly operation: 'flush';
    readonly triggerEventType: StatePersistedTriggerEventType;
    readonly runtimeMode: string;
    readonly capturedAt: number;
    readonly stateVersion: number;
    readonly allTimeScore: number;
    readonly levelId: string;
    readonly serializedLength: number;
  }
>;

export type LeaderboardSyncEvent = EventEnvelope<
  'domain/leaderboard-sync',
  {
    readonly commandType: 'SyncLeaderboard';
    readonly operation: 'sync-score';
    readonly requestedScore: number;
  }
>;

export type ApplicationEvent =
  | RuntimeReadyEvent
  | TickEvent
  | CommandRoutedEvent
  | WordSubmittedEvent
  | TargetWordAcceptedEvent
  | BonusWordAcceptedEvent
  | ProgressBarFillRequestedEvent
  | DisplayedTargetChangedEvent
  | HintPathProgressAdvancedEvent
  | LevelCompletedEvent
  | HelpActionAppliedEvent
  | HelpActionFailedEvent
  | WordSuccessEvent
  | LevelClearEvent
  | HelpEvent
  | PersistenceEvent
  | StatePersistedEvent
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
