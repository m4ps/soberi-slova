import type { CoreStateModule, CoreStateSnapshot } from '../domain/CoreState';
import type { HelpEconomyModule, HelpKind, HelpWindowState } from '../domain/HelpEconomy';
import type { LevelGeneratorModule } from '../domain/LevelGenerator';
import type { WordValidationModule } from '../domain/WordValidation';

export interface DomainModules {
  readonly coreState: CoreStateModule;
  readonly wordValidation: WordValidationModule;
  readonly levelGenerator: LevelGeneratorModule;
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
}

export interface ApplicationCommandBus {
  dispatch: (command: ApplicationCommand) => ApplicationResult<CommandAck>;
}

export type ApplicationQueryPayload<TQuery extends ApplicationQuery> =
  TQuery extends { readonly type: 'GetCoreState' }
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

export type ApplicationEvent =
  | { readonly type: 'application/runtime-ready'; readonly at: number }
  | { readonly type: 'application/tick'; readonly at: number }
  | {
      readonly type: 'application/command-routed';
      readonly commandType: Exclude<ApplicationCommand['type'], 'RuntimeReady' | 'Tick'>;
      readonly at: number;
      readonly correlationId: string | null;
    };

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
