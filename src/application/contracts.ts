import type { CoreStateModule, CoreStateSnapshot } from '../domain/CoreState';
import type { HelpEconomyModule } from '../domain/HelpEconomy';
import type { LevelGeneratorModule } from '../domain/LevelGenerator';
import type { WordValidationModule } from '../domain/WordValidation';

export interface DomainModules {
  readonly coreState: CoreStateModule;
  readonly wordValidation: WordValidationModule;
  readonly levelGenerator: LevelGeneratorModule;
  readonly helpEconomy: HelpEconomyModule;
}

export type ApplicationCommand =
  | { readonly type: 'bootstrap/ready' }
  | { readonly type: 'bootstrap/tick'; readonly nowTs: number };

export interface ApplicationCommandBus {
  dispatch: (command: ApplicationCommand) => void;
}

export interface ApplicationReadModel {
  getCoreState: () => CoreStateSnapshot;
}

export type ApplicationEvent =
  | { readonly type: 'application/runtime-ready'; readonly at: number }
  | { readonly type: 'application/tick'; readonly at: number };

export type ApplicationEventListener = (event: ApplicationEvent) => void;

export interface ApplicationEventBus {
  publish: (event: ApplicationEvent) => void;
  subscribe: (listener: ApplicationEventListener) => () => void;
}

export interface ApplicationLayer {
  readonly commands: ApplicationCommandBus;
  readonly readModel: ApplicationReadModel;
  readonly events: ApplicationEventBus;
}
