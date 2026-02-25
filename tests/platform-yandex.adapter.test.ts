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
    readonly adv?: {
      showRewardedVideo: (options: { readonly callbacks?: RewardedVideoCallbacks }) => void;
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
  readonly rewardedVideoCalls: readonly RewardedVideoCallbacks[];
  emit: (eventName: YandexLifecycleEvent) => void;
  getListenerCount: (eventName: YandexLifecycleEvent) => number;
  emitRewardedVideoOpen: (callIndex?: number) => void;
  emitRewardedVideoRewarded: (callIndex?: number) => void;
  emitRewardedVideoClose: (callIndex?: number) => void;
  emitRewardedVideoError: (error: unknown, callIndex?: number) => void;
}

interface RewardedVideoCallbacks {
  readonly onOpen?: () => void;
  readonly onRewarded?: () => void;
  readonly onClose?: () => void;
  readonly onError?: (error: unknown) => void;
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

function createMockSdkRuntime(options: { readonly includeAdvApi?: boolean } = {}): MockSdkRuntime {
  const listeners: Record<YandexLifecycleEvent, Set<() => void>> = {
    [YANDEX_LIFECYCLE_EVENTS.pause]: new Set(),
    [YANDEX_LIFECYCLE_EVENTS.resume]: new Set(),
  };
  const includeAdvApi = options.includeAdvApi ?? true;
  const rewardedVideoCalls: RewardedVideoCallbacks[] = [];

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
      ...(includeAdvApi
        ? {
            adv: {
              showRewardedVideo: (options: { readonly callbacks?: RewardedVideoCallbacks }) => {
                rewardedVideoCalls.push(options.callbacks ?? {});
              },
            },
          }
        : {}),
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
    rewardedVideoCalls,
    emit: (eventName) => {
      listeners[eventName].forEach((callback) => {
        callback();
      });
    },
    getListenerCount: (eventName) => {
      return listeners[eventName].size;
    },
    emitRewardedVideoOpen: (callIndex = 0) => {
      rewardedVideoCalls[callIndex]?.onOpen?.();
    },
    emitRewardedVideoRewarded: (callIndex = 0) => {
      rewardedVideoCalls[callIndex]?.onRewarded?.();
    },
    emitRewardedVideoClose: (callIndex = 0) => {
      rewardedVideoCalls[callIndex]?.onClose?.();
    },
    emitRewardedVideoError: (error, callIndex = 0) => {
      rewardedVideoCalls[callIndex]?.onError?.(error);
    },
  };
}

function createAdRequiredHelpEvent(
  operationId: string,
  helpKind: 'hint' | 'reshuffle',
  occurredAt: number,
): ApplicationEvent {
  return {
    eventId: `evt-help-${operationId}`,
    eventType: 'domain/help',
    eventVersion: 1,
    occurredAt,
    correlationId: operationId,
    payload: {
      phase: 'requested',
      commandType: helpKind === 'hint' ? 'RequestHint' : 'RequestReshuffle',
      operationId,
      helpKind,
      isFreeAction: false,
      requiresAd: true,
      applied: false,
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

  it('runs rewarded ad flow from help events and dispatches reward outcome once', async () => {
    const sdkRuntime = createMockSdkRuntime();
    const eventBus = createEventBus();
    const { commandBus, dispatchedCommands } = createCommandBusSpy();
    let nowTs = 1_000;
    const platformModule = createPlatformYandexModule(commandBus, eventBus, {
      resolveSdkInstance: async () => sdkRuntime.sdkInstance,
      now: () => nowTs,
      logger: () => {
        // keep test output clean
      },
    });

    await platformModule.bootstrap();
    eventBus.publish(createAdRequiredHelpEvent('op-help-1', 'hint', nowTs));
    expect(sdkRuntime.rewardedVideoCalls).toHaveLength(1);

    nowTs = 1_050;
    sdkRuntime.emitRewardedVideoOpen();
    nowTs = 1_240;
    sdkRuntime.emitRewardedVideoRewarded();
    sdkRuntime.emitRewardedVideoClose();
    await Promise.resolve();

    const adResultCommands = dispatchedCommands.filter(
      (
        command,
      ): command is Extract<ApplicationCommand, { readonly type: 'AcknowledgeAdResult' }> => {
        return command.type === 'AcknowledgeAdResult';
      },
    );

    expect(adResultCommands).toHaveLength(1);
    expect(adResultCommands[0]).toMatchObject({
      type: 'AcknowledgeAdResult',
      helpType: 'hint',
      operationId: 'op-help-1',
      outcome: 'reward',
      durationMs: 240,
      outcomeContext: null,
    });
    expect(sdkRuntime.counters.gameplayStopCalls).toBe(1);
    expect(sdkRuntime.counters.gameplayStartCalls).toBe(2);
  });

  it('maps rewarded ad no-fill errors into no-fill outcome', async () => {
    const sdkRuntime = createMockSdkRuntime();
    const eventBus = createEventBus();
    const { commandBus, dispatchedCommands } = createCommandBusSpy();
    let nowTs = 2_000;
    const platformModule = createPlatformYandexModule(commandBus, eventBus, {
      resolveSdkInstance: async () => sdkRuntime.sdkInstance,
      now: () => nowTs,
      logger: () => {
        // keep test output clean
      },
    });

    await platformModule.bootstrap();
    eventBus.publish(createAdRequiredHelpEvent('op-help-2', 'reshuffle', nowTs));
    expect(sdkRuntime.rewardedVideoCalls).toHaveLength(1);

    nowTs = 2_045;
    sdkRuntime.emitRewardedVideoError({ code: 'NO_FILL', message: 'No fill available' });
    await Promise.resolve();

    const adResultCommands = dispatchedCommands.filter(
      (
        command,
      ): command is Extract<ApplicationCommand, { readonly type: 'AcknowledgeAdResult' }> => {
        return command.type === 'AcknowledgeAdResult';
      },
    );

    expect(adResultCommands).toHaveLength(1);
    expect(adResultCommands[0]).toMatchObject({
      type: 'AcknowledgeAdResult',
      helpType: 'reshuffle',
      operationId: 'op-help-2',
      outcome: 'no-fill',
      durationMs: 45,
      outcomeContext: '[object Object]',
    });
  });

  it('dispatches ad error outcome when SDK runtime has no rewarded ad API', async () => {
    const sdkRuntime = createMockSdkRuntime({ includeAdvApi: false });
    const eventBus = createEventBus();
    const { commandBus, dispatchedCommands } = createCommandBusSpy();
    const platformModule = createPlatformYandexModule(commandBus, eventBus, {
      resolveSdkInstance: async () => sdkRuntime.sdkInstance,
      now: () => 3_000,
      logger: () => {
        // keep test output clean
      },
    });

    await platformModule.bootstrap();
    eventBus.publish(createAdRequiredHelpEvent('op-help-3', 'hint', 3_000));
    await Promise.resolve();

    const adResultCommands = dispatchedCommands.filter(
      (
        command,
      ): command is Extract<ApplicationCommand, { readonly type: 'AcknowledgeAdResult' }> => {
        return command.type === 'AcknowledgeAdResult';
      },
    );

    expect(adResultCommands).toHaveLength(1);
    expect(adResultCommands[0]).toMatchObject({
      type: 'AcknowledgeAdResult',
      helpType: 'hint',
      operationId: 'op-help-3',
      outcome: 'error',
      durationMs: 0,
      outcomeContext: 'Rewarded ad API is unavailable in SDK runtime.',
    });
  });
});
