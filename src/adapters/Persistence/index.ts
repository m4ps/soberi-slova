import type {
  ApplicationCommandBus,
  ApplicationEvent,
  ApplicationEventBus,
  ApplicationQueryBus,
  PersistedSessionSnapshot,
} from '../../application';
import { MODULE_IDS } from '../../shared/module-ids';
import { isRecordLike, parseNonNegativeSafeInteger } from '../../shared/runtime-guards';
import type { PlatformYandexModule } from '../PlatformYandex';

const PERSISTENCE_SNAPSHOT_SCHEMA_VERSION = 1;

type PersistencePlatformBridge = Pick<
  PlatformYandexModule,
  'readPersistenceState' | 'writePersistenceState'
>;

export interface PersistenceSnapshot {
  readonly runtimeMode: string;
  readonly capturedAt: number;
  readonly stateVersion: number;
  readonly allTimeScore: number;
  readonly levelId: string;
  readonly helpWindow: {
    readonly windowStartTs: number;
    readonly freeActionAvailable: boolean;
  };
  readonly serializedLength: number;
}

export interface PersistenceModuleOptions {
  readonly platform: PersistencePlatformBridge;
  readonly eventBus: ApplicationEventBus;
  readonly now?: () => number;
}

export interface PersistenceModule {
  readonly moduleName: typeof MODULE_IDS.persistence;
  restore: () => Promise<void>;
  flush: () => Promise<void>;
  dispose: () => void;
  getLastSnapshot: () => PersistenceSnapshot | null;
}

function parsePersistedSessionSnapshot(
  rawSnapshot: string | null,
): PersistedSessionSnapshot | null {
  if (typeof rawSnapshot !== 'string' || rawSnapshot.trim().length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawSnapshot);
  } catch {
    return null;
  }

  if (!isRecordLike(parsed)) {
    return null;
  }

  const schemaVersion = parseNonNegativeSafeInteger(parsed.schemaVersion);
  const capturedAt = parseNonNegativeSafeInteger(parsed.capturedAt);
  const gameStateSerializedCandidate = parsed.gameStateSerialized;
  const helpWindowCandidate = parsed.helpWindow;
  const normalizedGameStateSerialized =
    typeof gameStateSerializedCandidate === 'string' ? gameStateSerializedCandidate.trim() : '';

  if (
    schemaVersion === null ||
    capturedAt === null ||
    normalizedGameStateSerialized.length === 0 ||
    !isRecordLike(helpWindowCandidate)
  ) {
    return null;
  }

  const windowStartTs = parseNonNegativeSafeInteger(helpWindowCandidate.windowStartTs);
  const freeActionAvailableCandidate = helpWindowCandidate.freeActionAvailable;
  if (windowStartTs === null || typeof freeActionAvailableCandidate !== 'boolean') {
    return null;
  }

  return {
    schemaVersion,
    capturedAt,
    gameStateSerialized: normalizedGameStateSerialized,
    helpWindow: {
      windowStartTs,
      freeActionAvailable: freeActionAvailableCandidate,
    },
  };
}

function shouldFlushForEvent(event: ApplicationEvent): boolean {
  if (event.eventType === 'domain/help') {
    return true;
  }

  if (event.eventType === 'domain/word-submitted') {
    return event.payload.scoreDelta.totalScore > 0;
  }

  if (event.eventType === 'domain/word-success') {
    return event.payload.scoreDelta.totalScore > 0;
  }

  return event.eventType === 'domain/level-clear';
}

export function createPersistenceModule(
  commandBus: ApplicationCommandBus,
  queryBus: ApplicationQueryBus,
  options: PersistenceModuleOptions,
): PersistenceModule {
  const now = options.now ?? Date.now;
  let disposed = false;
  let lastSnapshot: PersistenceSnapshot | null = null;
  let flushQueue: Promise<void> = Promise.resolve();

  const captureSnapshot = (): {
    persisted: PersistedSessionSnapshot;
    snapshot: PersistenceSnapshot;
  } => {
    const coreStateResult = queryBus.execute({ type: 'GetCoreState' });
    if (coreStateResult.type !== 'ok') {
      throw new Error(`Failed to capture core state: ${coreStateResult.error.code}`);
    }

    const helpWindowResult = queryBus.execute({ type: 'GetHelpWindowState' });
    if (helpWindowResult.type !== 'ok') {
      throw new Error(`Failed to capture help window: ${helpWindowResult.error.code}`);
    }

    const coreStateSnapshot = coreStateResult.value;
    const helpWindowSnapshot = helpWindowResult.value;
    const capturedAt = now();
    const persisted: PersistedSessionSnapshot = {
      schemaVersion: PERSISTENCE_SNAPSHOT_SCHEMA_VERSION,
      capturedAt,
      gameStateSerialized: JSON.stringify(coreStateSnapshot.gameState),
      helpWindow: {
        windowStartTs: helpWindowSnapshot.windowStartTs,
        freeActionAvailable: helpWindowSnapshot.freeActionAvailable,
      },
    };
    const serializedSnapshot = JSON.stringify(persisted);

    return {
      persisted,
      snapshot: {
        runtimeMode: coreStateSnapshot.runtimeMode,
        capturedAt,
        stateVersion: coreStateSnapshot.gameplay.stateVersion,
        allTimeScore: coreStateSnapshot.gameplay.allTimeScore,
        levelId: coreStateSnapshot.gameplay.levelId,
        helpWindow: {
          windowStartTs: helpWindowSnapshot.windowStartTs,
          freeActionAvailable: helpWindowSnapshot.freeActionAvailable,
        },
        serializedLength: serializedSnapshot.length,
      },
    };
  };

  const enqueueFlush = (): Promise<void> => {
    flushQueue = flushQueue
      .then(async () => {
        if (disposed) {
          return;
        }

        const { persisted, snapshot } = captureSnapshot();
        await options.platform.writePersistenceState({
          serializedSnapshot: JSON.stringify(persisted),
          allTimeScore: snapshot.allTimeScore,
        });
        lastSnapshot = snapshot;
      })
      .catch(() => {
        // Persistence is best-effort; errors are surfaced via platform lifecycle logs.
      });

    return flushQueue;
  };

  const unsubscribeEvents = options.eventBus.subscribe((event) => {
    if (!shouldFlushForEvent(event)) {
      return;
    }

    void enqueueFlush();
  });

  return {
    moduleName: MODULE_IDS.persistence,
    restore: async () => {
      const persistedState = await options.platform.readPersistenceState();
      const localSnapshot = parsePersistedSessionSnapshot(persistedState.localSnapshot);
      const cloudSnapshot = parsePersistedSessionSnapshot(persistedState.cloudSnapshot);
      const restoreResult = commandBus.dispatch({
        type: 'RestoreSession',
        payload: {
          localSnapshot,
          cloudSnapshot,
          cloudAllTimeScore: persistedState.cloudAllTimeScore,
        },
      });

      if (restoreResult.type !== 'ok') {
        throw new Error(`RestoreSession command failed: ${restoreResult.error.code}`);
      }

      await enqueueFlush();
    },
    flush: async () => {
      await enqueueFlush();
    },
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      unsubscribeEvents();
    },
    getLastSnapshot: () => lastSnapshot,
  };
}
