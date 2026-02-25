import { MODULE_IDS } from '../../shared/module-ids';

export type HelpKind = 'hint' | 'reshuffle';

export interface HelpWindowState {
  readonly windowStartTs: number;
  readonly freeActionAvailable: boolean;
}

export interface HelpDecision {
  readonly kind: HelpKind;
  readonly operationId: string;
  readonly isFreeAction: boolean;
}

export interface HelpEconomyModule {
  readonly moduleName: typeof MODULE_IDS.helpEconomy;
  getWindowState: () => HelpWindowState;
  requestHelp: (kind: HelpKind, nowTs: number) => HelpDecision;
  markFreeActionConsumed: () => void;
}

export function createHelpEconomyModule(windowStartTs: number = Date.now()): HelpEconomyModule {
  let freeActionAvailable = true;

  return {
    moduleName: MODULE_IDS.helpEconomy,
    getWindowState: () => ({
      windowStartTs,
      freeActionAvailable,
    }),
    requestHelp: (kind, nowTs) => ({
      kind,
      operationId: `${kind}-${nowTs}`,
      isFreeAction: freeActionAvailable,
    }),
    markFreeActionConsumed: () => {
      freeActionAvailable = false;
    },
  };
}
