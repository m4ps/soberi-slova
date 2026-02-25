import type { ApplicationCommandBus, ApplicationQueryBus } from '../../application';
import { MODULE_IDS } from '../../shared/module-ids';

export interface PersistenceSnapshot {
  readonly runtimeMode: string;
  readonly capturedAt: number;
}

export interface PersistenceModule {
  readonly moduleName: typeof MODULE_IDS.persistence;
  restore: () => Promise<void>;
  flush: () => Promise<void>;
  getLastSnapshot: () => PersistenceSnapshot | null;
}

export function createPersistenceModule(
  commandBus: ApplicationCommandBus,
  queryBus: ApplicationQueryBus,
): PersistenceModule {
  let lastSnapshot: PersistenceSnapshot | null = null;

  const captureSnapshot = (): PersistenceSnapshot => {
    const stateResult = queryBus.execute({ type: 'GetCoreState' });

    return {
      runtimeMode: stateResult.type === 'ok' ? stateResult.value.runtimeMode : 'unknown',
      capturedAt: Date.now(),
    };
  };

  return {
    moduleName: MODULE_IDS.persistence,
    restore: async () => {
      lastSnapshot = captureSnapshot();
      commandBus.dispatch({ type: 'RestoreSession' });
    },
    flush: async () => {
      lastSnapshot = captureSnapshot();
    },
    getLastSnapshot: () => lastSnapshot,
  };
}
