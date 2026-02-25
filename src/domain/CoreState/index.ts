import { MODULE_IDS } from '../../shared/module-ids';

export type RuntimeMode = 'bootstrapping' | 'ready';

export interface CoreStateSnapshot {
  readonly runtimeMode: RuntimeMode;
}

export interface CoreStateModule {
  readonly moduleName: typeof MODULE_IDS.coreState;
  getSnapshot: () => CoreStateSnapshot;
  setRuntimeMode: (runtimeMode: RuntimeMode) => void;
}

export function createCoreStateModule(initialMode: RuntimeMode = 'bootstrapping'): CoreStateModule {
  let snapshot: CoreStateSnapshot = { runtimeMode: initialMode };

  return {
    moduleName: MODULE_IDS.coreState,
    getSnapshot: () => snapshot,
    setRuntimeMode: (runtimeMode) => {
      snapshot = { runtimeMode };
    },
  };
}
