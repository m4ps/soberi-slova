import type {
  ApplicationCommandBus,
  ApplicationEventBus,
  ApplicationResult,
  CommandAck,
} from '../../application';
import {
  YANDEX_LIFECYCLE_EVENTS,
  YANDEX_SDK_SCRIPT_LOAD_TIMEOUT_MS,
  YANDEX_SDK_SCRIPT_MARKER_ATTR,
  YANDEX_SDK_SCRIPT_SRC,
  type YandexLifecycleEvent,
} from '../../config/platform-yandex';

interface YandexLoadingAPI {
  ready: () => void | Promise<void>;
}

interface YandexGameplayAPI {
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
}

interface YandexSdkFeatures {
  readonly LoadingAPI?: YandexLoadingAPI;
  readonly GameplayAPI?: YandexGameplayAPI;
}

interface YandexSdkInstance {
  readonly features?: YandexSdkFeatures;
  on?: (eventName: YandexLifecycleEvent, callback: () => void) => void;
  off?: (eventName: YandexLifecycleEvent, callback: () => void) => void;
}

interface YandexGamesGlobal {
  init: () => Promise<YandexSdkInstance>;
}

type PlatformLifecycleEventType =
  | 'sdk-init-start'
  | 'sdk-init-success'
  | 'loading-ready'
  | 'gameplay-start'
  | 'gameplay-stop'
  | 'pause'
  | 'resume'
  | 'runtime-ready-dispatched'
  | 'application-runtime-ready-observed'
  | 'bootstrap-complete'
  | 'bootstrap-skipped'
  | 'dispose'
  | 'gameplay-start-error'
  | 'gameplay-stop-error';

export interface PlatformLifecycleLogEntry {
  readonly type: PlatformLifecycleEventType;
  readonly at: number;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface PlatformYandexOptions {
  readonly resolveSdkInstance?: () => Promise<YandexSdkInstance>;
  readonly sdkScriptSrc?: string;
  readonly now?: () => number;
  readonly logger?: (entry: PlatformLifecycleLogEntry) => void;
}

export interface PlatformYandexModule {
  readonly moduleName: 'PlatformYandex';
  bootstrap: () => Promise<void>;
  dispose: () => void;
  getLifecycleLog: () => readonly PlatformLifecycleLogEntry[];
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getYaGamesGlobal(): YandexGamesGlobal | null {
  const runtime = globalThis as typeof globalThis & {
    YaGames?: YandexGamesGlobal;
  };

  return runtime.YaGames ?? null;
}

async function resolveSdkFromGlobal(): Promise<YandexSdkInstance> {
  const yaGames = getYaGamesGlobal();

  if (!yaGames) {
    throw new Error('YaGames SDK is unavailable.');
  }

  return yaGames.init();
}

function waitForSdkScriptLoad(scriptElement: HTMLScriptElement, scriptSrc: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanupListeners();
      reject(new Error(`Timed out while loading YaGames SDK script: ${scriptSrc}`));
    }, YANDEX_SDK_SCRIPT_LOAD_TIMEOUT_MS);

    const onLoad = (): void => {
      cleanupListeners();
      resolve();
    };

    const onError = (): void => {
      cleanupListeners();
      reject(new Error(`Failed to load YaGames SDK script: ${scriptSrc}`));
    };

    const cleanupListeners = (): void => {
      clearTimeout(timeoutId);
      scriptElement.removeEventListener('load', onLoad);
      scriptElement.removeEventListener('error', onError);
    };

    scriptElement.addEventListener('load', onLoad, { once: true });
    scriptElement.addEventListener('error', onError, { once: true });
  });
}

async function loadSdkScript(scriptSrc: string): Promise<void> {
  if (typeof document === 'undefined') {
    throw new Error(
      'YaGames SDK is unavailable. Browser runtime is required. Start the app through @yandex-games/sdk-dev-proxy or Yandex draft runtime.',
    );
  }

  const existingSdkScript =
    document.querySelector<HTMLScriptElement>(`script[${YANDEX_SDK_SCRIPT_MARKER_ATTR}="true"]`) ??
    document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`);

  if (existingSdkScript) {
    if (getYaGamesGlobal()) {
      return;
    }

    await waitForSdkScriptLoad(existingSdkScript, scriptSrc);
    return;
  }

  const scriptElement = document.createElement('script');
  scriptElement.src = scriptSrc;
  scriptElement.async = true;
  scriptElement.setAttribute(YANDEX_SDK_SCRIPT_MARKER_ATTR, 'true');
  document.head.append(scriptElement);

  await waitForSdkScriptLoad(scriptElement, scriptSrc);
}

async function resolveSdkFromRuntime(scriptSrc: string): Promise<YandexSdkInstance> {
  if (!getYaGamesGlobal()) {
    await loadSdkScript(scriptSrc);
  }

  const yaGames = getYaGamesGlobal();

  if (!yaGames) {
    throw new Error(
      `YaGames SDK is unavailable after loading "${scriptSrc}". Start the app through @yandex-games/sdk-dev-proxy or Yandex draft runtime.`,
    );
  }

  return resolveSdkFromGlobal();
}

function assertCommandResultOk(result: ApplicationResult<CommandAck>, commandType: string): void {
  if (result.type === 'ok') {
    return;
  }

  throw new Error(
    `[PlatformYandex] Failed to dispatch ${commandType}: ${result.error.code} (${result.error.message})`,
  );
}

async function invokeLifecycleMethod(
  method: (() => void | Promise<void>) | undefined,
): Promise<void> {
  if (!method) {
    return;
  }

  await method();
}

export function createPlatformYandexModule(
  commandBus: ApplicationCommandBus,
  eventBus: ApplicationEventBus,
  options: PlatformYandexOptions = {},
): PlatformYandexModule {
  const sdkScriptSrc = options.sdkScriptSrc ?? YANDEX_SDK_SCRIPT_SRC;
  const resolveSdk = options.resolveSdkInstance ?? (() => resolveSdkFromRuntime(sdkScriptSrc));
  const now = options.now ?? Date.now;
  const lifecycleLog: PlatformLifecycleLogEntry[] = [];
  const logger =
    options.logger ??
    ((entry: PlatformLifecycleLogEntry) => {
      console.info(`[PlatformYandex] ${entry.type}`, entry.context);
    });

  let sdkInstance: YandexSdkInstance | null = null;
  let unsubscribeApplicationEvents: (() => void) | null = null;
  let unsubscribeLifecycleEvents: (() => void) | null = null;
  let bootstrapped = false;

  const record = (
    type: PlatformLifecycleEventType,
    context: Readonly<Record<string, unknown>> = {},
  ): void => {
    const entry: PlatformLifecycleLogEntry = {
      type,
      at: now(),
      context,
    };

    lifecycleLog.push(entry);
    logger(entry);
  };

  const startGameplay = async (source: 'bootstrap' | 'resume'): Promise<void> => {
    await invokeLifecycleMethod(sdkInstance?.features?.GameplayAPI?.start);
    record('gameplay-start', {
      source,
      hasGameplayApi: Boolean(sdkInstance?.features?.GameplayAPI),
    });
  };

  const stopGameplay = async (source: 'pause' | 'dispose'): Promise<void> => {
    await invokeLifecycleMethod(sdkInstance?.features?.GameplayAPI?.stop);
    record('gameplay-stop', {
      source,
      hasGameplayApi: Boolean(sdkInstance?.features?.GameplayAPI),
    });
  };

  const handlePause = (): void => {
    record('pause');
    void stopGameplay('pause').catch((error: unknown) => {
      record('gameplay-stop-error', {
        source: 'pause',
        reason: toErrorMessage(error),
      });
    });
  };

  const handleResume = (): void => {
    record('resume');
    void startGameplay('resume').catch((error: unknown) => {
      record('gameplay-start-error', {
        source: 'resume',
        reason: toErrorMessage(error),
      });
    });
  };

  return {
    moduleName: 'PlatformYandex',
    bootstrap: async () => {
      if (bootstrapped) {
        record('bootstrap-skipped', {
          reason: 'already-bootstrapped',
        });
        return;
      }

      if (!unsubscribeApplicationEvents) {
        unsubscribeApplicationEvents = eventBus.subscribe((event) => {
          if (event.type === 'application/runtime-ready') {
            record('application-runtime-ready-observed', {
              at: event.at,
            });
          }
        });
      }

      record('sdk-init-start');
      sdkInstance = await resolveSdk();
      record('sdk-init-success');

      await invokeLifecycleMethod(sdkInstance.features?.LoadingAPI?.ready);
      record('loading-ready', {
        hasLoadingApi: Boolean(sdkInstance.features?.LoadingAPI),
      });

      await startGameplay('bootstrap');

      if (sdkInstance.on && sdkInstance.off) {
        sdkInstance.on(YANDEX_LIFECYCLE_EVENTS.pause, handlePause);
        sdkInstance.on(YANDEX_LIFECYCLE_EVENTS.resume, handleResume);

        unsubscribeLifecycleEvents = () => {
          sdkInstance?.off?.(YANDEX_LIFECYCLE_EVENTS.pause, handlePause);
          sdkInstance?.off?.(YANDEX_LIFECYCLE_EVENTS.resume, handleResume);
        };
      }

      const runtimeReadyResult = commandBus.dispatch({ type: 'RuntimeReady' });
      assertCommandResultOk(runtimeReadyResult, 'RuntimeReady');
      record('runtime-ready-dispatched');

      bootstrapped = true;
      record('bootstrap-complete');
    },
    dispose: () => {
      unsubscribeLifecycleEvents?.();
      unsubscribeLifecycleEvents = null;

      unsubscribeApplicationEvents?.();
      unsubscribeApplicationEvents = null;

      if (sdkInstance) {
        void stopGameplay('dispose').catch((error: unknown) => {
          record('gameplay-stop-error', {
            source: 'dispose',
            reason: toErrorMessage(error),
          });
        });
      }

      sdkInstance = null;
      bootstrapped = false;

      record('dispose');
    },
    getLifecycleLog: () => lifecycleLog,
  };
}
