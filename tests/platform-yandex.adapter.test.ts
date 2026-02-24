import { describe, expect, it } from 'vitest';

import { createPlatformYandexModule } from '../src/adapters/PlatformYandex';
import type {
  ApplicationCommand,
  ApplicationCommandBus,
  ApplicationEvent,
  ApplicationEventBus,
  ApplicationResult,
  CommandAck,
} from '../src/application';

type LifecycleEventName = 'game_api_pause' | 'game_api_resume';

interface MockSdkRuntime {
  readonly sdkInstance: {
    readonly features: {
      readonly LoadingAPI: {
        ready: () => void;
      };
      readonly GameplayAPI: {
        start: () => void;
        stop: () => void;
      };
    };
    on: (eventName: LifecycleEventName, callback: () => void) => void;
    off: (eventName: LifecycleEventName, callback: () => void) => void;
  };
  readonly counters: {
    loadingReadyCalls: number;
    gameplayStartCalls: number;
    gameplayStopCalls: number;
  };
  readonly onCalls: LifecycleEventName[];
  readonly offCalls: LifecycleEventName[];
  emit: (eventName: LifecycleEventName) => void;
  getListenerCount: (eventName: LifecycleEventName) => number;
}

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
          handledAt: 1,
        },
      };
    },
  };

  return {
    commandBus,
    dispatchedCommands,
  };
}

function createMockSdkRuntime(): MockSdkRuntime {
  const listeners: Record<LifecycleEventName, Set<() => void>> = {
    game_api_pause: new Set(),
    game_api_resume: new Set(),
  };

  const counters = {
    loadingReadyCalls: 0,
    gameplayStartCalls: 0,
    gameplayStopCalls: 0,
  };

  const onCalls: LifecycleEventName[] = [];
  const offCalls: LifecycleEventName[] = [];

  return {
    sdkInstance: {
      features: {
        LoadingAPI: {
          ready: () => {
            counters.loadingReadyCalls += 1;
          },
        },
        GameplayAPI: {
          start: () => {
            counters.gameplayStartCalls += 1;
          },
          stop: () => {
            counters.gameplayStopCalls += 1;
          },
        },
      },
      on: (eventName, callback) => {
        onCalls.push(eventName);
        listeners[eventName].add(callback);
      },
      off: (eventName, callback) => {
        offCalls.push(eventName);
        listeners[eventName].delete(callback);
      },
    },
    counters,
    onCalls,
    offCalls,
    emit: (eventName) => {
      listeners[eventName].forEach((callback) => {
        callback();
      });
    },
    getListenerCount: (eventName) => {
      return listeners[eventName].size;
    },
  };
}

describe('PlatformYandex adapter', () => {
  it('bootstraps YaGames lifecycle and dispatches RuntimeReady command', async () => {
    const sdkRuntime = createMockSdkRuntime();
    const { commandBus, dispatchedCommands } = createCommandBusSpy();
    const platformModule = createPlatformYandexModule(commandBus, createEventBus(), {
      resolveSdkInstance: async () => sdkRuntime.sdkInstance,
      now: () => 1,
      logger: () => {
        // keep test output clean
      },
    });

    await platformModule.bootstrap();

    expect(dispatchedCommands).toEqual([{ type: 'RuntimeReady' }]);
    expect(sdkRuntime.counters.loadingReadyCalls).toBe(1);
    expect(sdkRuntime.counters.gameplayStartCalls).toBe(1);
    expect(sdkRuntime.onCalls).toEqual(['game_api_pause', 'game_api_resume']);

    const lifecycleTypes = platformModule.getLifecycleLog().map((entry) => entry.type);
    expect(lifecycleTypes).toEqual(
      expect.arrayContaining([
        'sdk-init-start',
        'sdk-init-success',
        'loading-ready',
        'gameplay-start',
        'runtime-ready-dispatched',
        'bootstrap-complete',
      ]),
    );
  });

  it('maps pause/resume SDK events to GameplayAPI.stop/start', async () => {
    const sdkRuntime = createMockSdkRuntime();
    const { commandBus } = createCommandBusSpy();
    const platformModule = createPlatformYandexModule(commandBus, createEventBus(), {
      resolveSdkInstance: async () => sdkRuntime.sdkInstance,
      now: () => Date.now(),
      logger: () => {
        // keep test output clean
      },
    });

    await platformModule.bootstrap();
    sdkRuntime.emit('game_api_pause');
    sdkRuntime.emit('game_api_resume');
    await Promise.resolve();
    await Promise.resolve();

    expect(sdkRuntime.counters.gameplayStopCalls).toBe(1);
    expect(sdkRuntime.counters.gameplayStartCalls).toBe(2);

    const lifecycleTypes = platformModule.getLifecycleLog().map((entry) => entry.type);
    expect(lifecycleTypes).toEqual(expect.arrayContaining(['pause', 'resume', 'gameplay-stop']));
  });

  it('detaches SDK listeners and stops gameplay on dispose', async () => {
    const sdkRuntime = createMockSdkRuntime();
    const { commandBus } = createCommandBusSpy();
    const platformModule = createPlatformYandexModule(commandBus, createEventBus(), {
      resolveSdkInstance: async () => sdkRuntime.sdkInstance,
      now: () => Date.now(),
      logger: () => {
        // keep test output clean
      },
    });

    await platformModule.bootstrap();
    platformModule.dispose();
    await Promise.resolve();

    expect(sdkRuntime.getListenerCount('game_api_pause')).toBe(0);
    expect(sdkRuntime.getListenerCount('game_api_resume')).toBe(0);
    expect(sdkRuntime.offCalls).toEqual(['game_api_pause', 'game_api_resume']);
    expect(sdkRuntime.counters.gameplayStopCalls).toBe(1);
    expect(
      platformModule
        .getLifecycleLog()
        .map((entry) => entry.type)
        .includes('dispose'),
    ).toBe(true);
  });

  it('returns actionable error when YaGames SDK global is missing', async () => {
    const runtime = globalThis as typeof globalThis & {
      YaGames?: unknown;
    };
    const previousYaGames = runtime.YaGames;
    delete runtime.YaGames;

    const { commandBus } = createCommandBusSpy();
    const platformModule = createPlatformYandexModule(commandBus, createEventBus(), {
      logger: () => {
        // keep test output clean
      },
    });

    await expect(platformModule.bootstrap()).rejects.toThrow(
      'Start the app through @yandex-games/sdk-dev-proxy or Yandex draft runtime.',
    );

    if (previousYaGames) {
      runtime.YaGames = previousYaGames;
    } else {
      delete runtime.YaGames;
    }
  });
});
