export type RuntimeMode = 'bootstrapping' | 'ready';

export interface CoreStateSnapshot {
  readonly runtimeMode: RuntimeMode;
}

export interface CoreStateModule {
  readonly moduleName: 'CoreState';
  getSnapshot: () => CoreStateSnapshot;
  setRuntimeMode: (runtimeMode: RuntimeMode) => void;
}

export function createCoreStateModule(initialMode: RuntimeMode = 'bootstrapping'): CoreStateModule {
  let snapshot: CoreStateSnapshot = { runtimeMode: initialMode };

  return {
    moduleName: 'CoreState',
    getSnapshot: () => snapshot,
    setRuntimeMode: (runtimeMode) => {
      snapshot = { runtimeMode };
    },
  };
}
