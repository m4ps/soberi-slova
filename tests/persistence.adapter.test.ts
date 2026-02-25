import { describe, expect, it, vi } from 'vitest';

import { createPersistenceModule } from '../src/adapters/Persistence';
import { createCoreStateModule } from '../src/domain/CoreState';
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

function createQueryBusFixture(nowTs: number): ApplicationQueryBus {
  const coreState = createCoreStateModule({
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
    expect(persistence.getLastSnapshot()).toMatchObject({
      runtimeMode: 'bootstrapping',
      capturedAt: 5_000,
      allTimeScore: 0,
      stateVersion: 0,
    });
  });

  it('ignores malformed persisted snapshots during restore payload mapping', async () => {
    const eventBus = createEventBus();
    const { commandBus, dispatchedCommands } = createCommandBusSpy();
    const queryBus = createQueryBusFixture(6_000);
    const persistence = createPersistenceModule(commandBus, queryBus, {
      eventBus,
      platform: {
        readPersistenceState: async () => ({
          localSnapshot: '{bad-json',
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
        localSnapshot: null,
        cloudSnapshot: null,
        cloudAllTimeScore: 10,
      },
    });
  });
});
