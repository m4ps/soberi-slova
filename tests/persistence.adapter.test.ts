import { describe, expect, it, vi } from 'vitest';

import { createPersistenceModule } from '../src/adapters/Persistence';
import { createCoreStateModule } from '../src/domain/CoreState';
import type { GameStateInput } from '../src/domain/GameState';
import { createHelpEconomyModule } from '../src/domain/HelpEconomy';
import type {
  ApplicationCommand,
  ApplicationCommandBus,
  ApplicationEvent,
  ApplicationEventBus,
  ApplicationQuery,
  ApplicationQueryBus,
  ApplicationResult,
  CommandAck,
} from '../src/application';
import { createNearCompletionFixtureState } from './helpers/game-state-fixtures';

function createEventBus(): ApplicationEventBus {
  const listeners = new Set<(event: ApplicationEvent) => void>();

  return {
    publish: (event: ApplicationEvent) => {
      listeners.forEach((listener) => {
        listener(event);
      });
    },
    subscribe: (listener: (event: ApplicationEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function createCommandBusSpy(): {
  readonly commandBus: ApplicationCommandBus;
  readonly dispatchedCommands: ApplicationCommand[];
} {
  const dispatchedCommands: ApplicationCommand[] = [];

  const commandBus: ApplicationCommandBus = {
    dispatch: (command: ApplicationCommand): ApplicationResult<CommandAck> => {
      dispatchedCommands.push(command);
      return {
        type: 'ok',
        value: {
          commandType: command.type,
          handledAt: 1_000,
          correlationId: `${command.type}-correlation`,
        },
      };
    },
  };

  return {
    commandBus,
    dispatchedCommands,
  };
}

function createQueryBusFixture(
  nowTs: number,
  initialGameState?: GameStateInput,
): ApplicationQueryBus {
  const coreState = createCoreStateModule({
    ...(initialGameState ? { initialGameState } : {}),
    nowProvider: () => nowTs,
  });
  const helpEconomy = createHelpEconomyModule({
    windowStartTs: nowTs,
    freeActionAvailable: true,
    nowProvider: () => nowTs,
  });

  return {
    execute: <TQuery extends ApplicationQuery>(query: TQuery) => {
      if (query.type === 'GetCoreState') {
        return {
          type: 'ok',
          value: coreState.getSnapshot(),
        } as never;
      }

      return {
        type: 'ok',
        value: helpEconomy.getWindowState(nowTs),
      } as never;
    },
  };
}

describe('persistence adapter', () => {
  it('loads local/cloud snapshots, dispatches RestoreSession and persists merged snapshot', async () => {
    const eventBus = createEventBus();
    const observedEvents: ApplicationEvent[] = [];
    eventBus.subscribe((event) => {
      observedEvents.push(event);
    });
    const { commandBus, dispatchedCommands } = createCommandBusSpy();
    const queryBus = createQueryBusFixture(5_000);
    const localGameState = createCoreStateModule({
      nowProvider: () => 5_000,
    }).getSnapshot().gameState;
    const cloudGameState = {
      ...localGameState,
      stateVersion: localGameState.stateVersion + 2,
      updatedAt: localGameState.updatedAt + 100,
      allTimeScore: 77,
    };
    const writePersistenceState = vi.fn().mockResolvedValue(undefined);
    const persistence = createPersistenceModule(commandBus, queryBus, {
      eventBus,
      platform: {
        readPersistenceState: async () => ({
          localSnapshot: JSON.stringify({
            schemaVersion: 1,
            capturedAt: 4_900,
            gameStateSerialized: JSON.stringify(localGameState),
            helpWindow: {
              windowStartTs: 4_900,
              freeActionAvailable: false,
            },
          }),
          cloudSnapshot: JSON.stringify({
            schemaVersion: 1,
            capturedAt: 4_950,
            gameStateSerialized: JSON.stringify(cloudGameState),
            helpWindow: {
              windowStartTs: 4_950,
              freeActionAvailable: true,
            },
          }),
          cloudAllTimeScore: 99,
        }),
        writePersistenceState,
      },
      now: () => 5_000,
    });

    await persistence.restore();

    expect(dispatchedCommands).toHaveLength(1);
    const restoreCommand = dispatchedCommands[0];
    if (!restoreCommand) {
      throw new Error('Expected RestoreSession command.');
    }
    expect(restoreCommand.type).toBe('RestoreSession');
    if (restoreCommand.type !== 'RestoreSession') {
      throw new Error('Expected RestoreSession command.');
    }

    expect(restoreCommand.payload).toMatchObject({
      localSnapshot: expect.objectContaining({
        schemaVersion: 1,
        capturedAt: 4_900,
      }),
      cloudSnapshot: expect.objectContaining({
        schemaVersion: 1,
        capturedAt: 4_950,
      }),
      cloudAllTimeScore: 99,
    });
    expect(writePersistenceState).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(writePersistenceState.mock.calls[0]?.[0]?.serializedSnapshot as string),
    ).toEqual(
      expect.objectContaining({
        schemaVersion: 2,
        capturedAt: 5_000,
      }),
    );
    expect(persistence.getLastSnapshot()).toMatchObject({
      runtimeMode: 'bootstrapping',
      capturedAt: 5_000,
      allTimeScore: 0,
      stateVersion: 0,
    });
    expect(observedEvents).toContainEqual(
      expect.objectContaining({
        eventType: 'domain/state-persisted',
        correlationId: 'RestoreSession-correlation',
        payload: expect.objectContaining({
          operation: 'flush',
          triggerEventType: 'domain/persistence',
          capturedAt: 5_000,
          stateVersion: 0,
          allTimeScore: 0,
        }),
      }),
    );
  });

  it('keeps valid game-state payloads and drops helpWindow-only legacy sidecars during restore', async () => {
    const eventBus = createEventBus();
    const { commandBus, dispatchedCommands } = createCommandBusSpy();
    const queryBus = createQueryBusFixture(6_000);
    const localGameState: GameStateInput = {
      ...createNearCompletionFixtureState({
        levelId: 'level-partial-local',
        source: 'persistence-partial-local',
        seed: 23,
      }),
      currentDisplayedTargetId: 'сон',
      currentHintPathProgress: 2,
    };
    const persistence = createPersistenceModule(commandBus, queryBus, {
      eventBus,
      platform: {
        readPersistenceState: async () => ({
          localSnapshot: JSON.stringify({
            schemaVersion: 1,
            capturedAt: 5_850,
            gameStateSerialized: JSON.stringify(localGameState),
            helpWindow: {
              windowStartTs: 'bad-window',
              freeActionAvailable: true,
            },
          }),
          cloudSnapshot: JSON.stringify({
            schemaVersion: 1,
            capturedAt: 5_900,
            gameStateSerialized: '',
            helpWindow: {
              windowStartTs: 5_900,
              freeActionAvailable: true,
            },
          }),
          cloudAllTimeScore: 10,
        }),
        writePersistenceState: async () => undefined,
      },
      now: () => 6_000,
    });

    await persistence.restore();

    const restoreCommand = dispatchedCommands[0];
    if (!restoreCommand) {
      throw new Error('Expected RestoreSession command.');
    }
    expect(restoreCommand).toMatchObject({
      type: 'RestoreSession',
      payload: {
        localSnapshot: {
          schemaVersion: 1,
          capturedAt: 5_850,
          gameStateSerialized: JSON.stringify(localGameState),
        },
        cloudSnapshot: null,
        cloudAllTimeScore: 10,
      },
    });
  });

  it('flushes rebalance score snapshots for score events and ignores zero-delta repeats', async () => {
    const eventBus = createEventBus();
    const { commandBus } = createCommandBusSpy();
    let nowTs = 7_000;
    let coreStateSnapshot = createCoreStateModule({
      initialGameState: {
        ...createNearCompletionFixtureState({
          levelId: 'level-persist-guided',
          source: 'persistence-guided',
          seed: 41,
        }),
        currentDisplayedTargetId: 'сон',
        currentHintPathProgress: 2,
      },
      nowProvider: () => nowTs,
    }).getSnapshot();
    const helpEconomy = createHelpEconomyModule({
      windowStartTs: nowTs,
      freeActionAvailable: true,
      nowProvider: () => nowTs,
    });
    const writePersistenceState = vi.fn().mockResolvedValue(undefined);
    createPersistenceModule(
      commandBus,
      {
        execute: <TQuery extends ApplicationQuery>(query: TQuery) => {
          if (query.type === 'GetCoreState') {
            return {
              type: 'ok',
              value: coreStateSnapshot,
            } as never;
          }

          return {
            type: 'ok',
            value: helpEconomy.getWindowState(nowTs),
          } as never;
        },
      },
      {
        eventBus,
        platform: {
          readPersistenceState: async () => ({
            localSnapshot: null,
            cloudSnapshot: null,
            cloudAllTimeScore: null,
          }),
          writePersistenceState,
        },
        now: () => nowTs,
      },
    );

    nowTs = 7_101;
    coreStateSnapshot = {
      ...coreStateSnapshot,
      runtimeMode: 'ready',
      gameState: {
        ...coreStateSnapshot.gameState,
        updatedAt: nowTs,
        stateVersion: 1,
        allTimeScore: 7,
      },
      gameplay: {
        ...coreStateSnapshot.gameplay,
        updatedAt: nowTs,
        stateVersion: 1,
        allTimeScore: 7,
      },
    };
    eventBus.publish({
      eventId: 'evt-target-rebalance',
      eventType: 'domain/target-word-accepted',
      eventVersion: 1,
      occurredAt: nowTs,
      correlationId: 'score-1',
      payload: {
        commandType: 'SubmitPath',
        targetWord: 'дом',
        pathCells: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ],
        wordSuccessOperationId: 'op-word-1',
        levelCompleted: false,
        levelId: coreStateSnapshot.gameplay.levelId,
        stateVersion: 1,
        displayedTargetId: 'нос',
        scoreDelta: {
          wordScore: 7,
          levelClearScore: 0,
          totalScore: 7,
        },
        progress: {
          foundTargets: 8,
          totalTargets: 10,
        },
        allTimeScore: 7,
      },
    });

    await vi.waitFor(() => {
      expect(writePersistenceState).toHaveBeenCalledTimes(1);
    });

    expect(writePersistenceState).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        allTimeScore: 7,
      }),
    );
    expect(
      JSON.parse(
        JSON.parse(writePersistenceState.mock.calls[0]?.[0]?.serializedSnapshot as string)
          .gameStateSerialized as string,
      ),
    ).toMatchObject({
      allTimeScore: 7,
      stateVersion: 1,
      currentDisplayedTargetId: 'сон',
      currentHintPathProgress: 2,
    });

    nowTs = 7_102;
    eventBus.publish({
      eventId: 'evt-target-repeat',
      eventType: 'domain/target-word-accepted',
      eventVersion: 1,
      occurredAt: nowTs,
      correlationId: 'score-repeat',
      payload: {
        commandType: 'SubmitPath',
        targetWord: 'дом',
        pathCells: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ],
        wordSuccessOperationId: 'op-word-1',
        levelCompleted: false,
        levelId: coreStateSnapshot.gameplay.levelId,
        stateVersion: 1,
        displayedTargetId: 'нос',
        scoreDelta: {
          wordScore: 0,
          levelClearScore: 0,
          totalScore: 0,
        },
        progress: {
          foundTargets: 8,
          totalTargets: 10,
        },
        allTimeScore: 7,
      },
    });

    await Promise.resolve();
    expect(writePersistenceState).toHaveBeenCalledTimes(1);

    nowTs = 7_120;
    coreStateSnapshot = {
      ...coreStateSnapshot,
      gameState: {
        ...coreStateSnapshot.gameState,
        updatedAt: nowTs,
        stateVersion: 2,
        allTimeScore: 27,
      },
      gameplay: {
        ...coreStateSnapshot.gameplay,
        updatedAt: nowTs,
        stateVersion: 2,
        allTimeScore: 27,
      },
    };
    eventBus.publish({
      eventId: 'evt-word-success-rebalance',
      eventType: 'domain/word-success',
      eventVersion: 1,
      occurredAt: nowTs,
      correlationId: 'score-2',
      payload: {
        commandType: 'AcknowledgeWordSuccessAnimation',
        wordId: 'дом',
        levelClearAwarded: true,
        scoreDelta: {
          wordScore: 0,
          levelClearScore: 20,
          totalScore: 20,
        },
        allTimeScore: 27,
      },
    });

    await vi.waitFor(() => {
      expect(writePersistenceState).toHaveBeenCalledTimes(2);
    });

    expect(writePersistenceState).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        allTimeScore: 27,
      }),
    );
    expect(
      JSON.parse(
        JSON.parse(writePersistenceState.mock.calls[1]?.[0]?.serializedSnapshot as string)
          .gameStateSerialized as string,
      ),
    ).toMatchObject({
      allTimeScore: 27,
      stateVersion: 2,
    });
  });
});
