import type { ApplicationCommandBus, ApplicationReadModel } from '../../application';

export interface PersistenceSnapshot {
  readonly runtimeMode: string;
  readonly capturedAt: number;
}

export interface PersistenceModule {
  readonly moduleName: 'Persistence';
  restore: () => Promise<void>;
  flush: () => Promise<void>;
  getLastSnapshot: () => PersistenceSnapshot | null;
}

export function createPersistenceModule(
  commandBus: ApplicationCommandBus,
  readModel: ApplicationReadModel,
): PersistenceModule {
  let lastSnapshot: PersistenceSnapshot | null = null;

  const captureSnapshot = (): PersistenceSnapshot => ({
    runtimeMode: readModel.getCoreState().runtimeMode,
    capturedAt: Date.now(),
  });

  return {
    moduleName: 'Persistence',
    restore: async () => {
      lastSnapshot = captureSnapshot();
      commandBus.dispatch({ type: 'bootstrap/tick', nowTs: lastSnapshot.capturedAt });
    },
    flush: async () => {
      lastSnapshot = captureSnapshot();
    },
    getLastSnapshot: () => lastSnapshot,
  };
}
