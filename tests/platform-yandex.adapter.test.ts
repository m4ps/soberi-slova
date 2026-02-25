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
import { YANDEX_LIFECYCLE_EVENTS, type YandexLifecycleEvent } from '../src/config/platform-yandex';

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
    on: (eventName: YandexLifecycleEvent, callback: () => void) => void;
    off: (eventName: YandexLifecycleEvent, callback: () => void) => void;
  };
  readonly counters: {
    loadingReadyCalls: number;
    gameplayStartCalls: number;
    gameplayStopCalls: number;
  };
  readonly onCalls: YandexLifecycleEvent[];
  readonly offCalls: YandexLifecycleEvent[];
  emit: (eventName: YandexLifecycleEvent) => void;
  getListenerCount: (eventName: YandexLifecycleEvent) => number;
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

function createCommandBusSpy(options?: {
  readonly runtimeReadyResult?: ApplicationResult<CommandAck>;
}): {
  readonly commandBus: ApplicationCommandBus;
  readonly dispatchedCommands: ApplicationCommand[];
} {
  const dispatchedCommands: ApplicationCommand[] = [];

  const commandBus: ApplicationCommandBus = {
    dispatch: (command: ApplicationCommand): ApplicationResult<CommandAck> => {
      dispatchedCommands.push(command);

      if (command.type === 'RuntimeReady' && options?.runtimeReadyResult) {
        return options.runtimeReadyResult;
      }

      return {
        type: 'ok',
        value: {
          commandType: command.type,
          handledAt: 1,
          correlationId: `${command.type}-test-correlation`,
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
  const listeners: Record<YandexLifecycleEvent, Set<() => void>> = {
    [YANDEX_LIFECYCLE_EVENTS.pause]: new Set(),
    [YANDEX_LIFECYCLE_EVENTS.resume]: new Set(),
  };

  const counters = {
    loadingReadyCalls: 0,
    gameplayStartCalls: 0,
    gameplayStopCalls: 0,
  };

  const onCalls: YandexLifecycleEvent[] = [];
  const offCalls: YandexLifecycleEvent[] = [];

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
    expect(sdkRuntime.onCalls).toEqual([
      YANDEX_LIFECYCLE_EVENTS.pause,
      YANDEX_LIFECYCLE_EVENTS.resume,
    ]);

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
    sdkRuntime.emit(YANDEX_LIFECYCLE_EVENTS.pause);
    sdkRuntime.emit(YANDEX_LIFECYCLE_EVENTS.resume);
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

    expect(sdkRuntime.getListenerCount(YANDEX_LIFECYCLE_EVENTS.pause)).toBe(0);
    expect(sdkRuntime.getListenerCount(YANDEX_LIFECYCLE_EVENTS.resume)).toBe(0);
    expect(sdkRuntime.offCalls).toEqual([
      YANDEX_LIFECYCLE_EVENTS.pause,
      YANDEX_LIFECYCLE_EVENTS.resume,
    ]);
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

  it('rejects untrusted sdk script source when runtime loader is used', async () => {
    const { commandBus } = createCommandBusSpy();
    const platformModule = createPlatformYandexModule(commandBus, createEventBus(), {
      sdkScriptSrc: 'https://evil.example/sdk.js',
      logger: () => {
        // keep test output clean
      },
    });

    await expect(platformModule.bootstrap()).rejects.toThrow('Untrusted YaGames SDK script source');
  });

  it('rolls back gameplay/listeners if RuntimeReady dispatch fails', async () => {
    const sdkRuntime = createMockSdkRuntime();
    const runtimeReadyFailure: ApplicationResult<CommandAck> = {
      type: 'domainError',
      error: {
        code: 'runtime.not-ready',
        message: 'Runtime is blocked.',
        retryable: false,
        context: {},
      },
    };
    const { commandBus } = createCommandBusSpy({
      runtimeReadyResult: runtimeReadyFailure,
    });
    const platformModule = createPlatformYandexModule(commandBus, createEventBus(), {
      resolveSdkInstance: async () => sdkRuntime.sdkInstance,
      logger: () => {
        // keep test output clean
      },
    });

    await expect(platformModule.bootstrap()).rejects.toThrow(
      'Failed to dispatch RuntimeReady: runtime.not-ready (Runtime is blocked.)',
    );

    expect(sdkRuntime.counters.gameplayStartCalls).toBe(1);
    expect(sdkRuntime.counters.gameplayStopCalls).toBe(1);
    expect(sdkRuntime.getListenerCount(YANDEX_LIFECYCLE_EVENTS.pause)).toBe(0);
    expect(sdkRuntime.getListenerCount(YANDEX_LIFECYCLE_EVENTS.resume)).toBe(0);
    expect(
      platformModule
        .getLifecycleLog()
        .map((entry) => entry.type)
        .includes('bootstrap-failed'),
    ).toBe(true);
  });
});
