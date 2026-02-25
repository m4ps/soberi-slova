import type {
  ApplicationCommandBus,
  ApplicationEvent,
  ApplicationEventBus,
  ApplicationResult,
  CommandAck,
  RewardedAdOutcome,
} from '../../application';
import {
  YANDEX_LIFECYCLE_EVENTS,
  YANDEX_SDK_SCRIPT_LOAD_TIMEOUT_MS,
  YANDEX_SDK_SCRIPT_MARKER_ATTR,
  YANDEX_SDK_SCRIPT_SRC,
  type YandexLifecycleEvent,
} from '../../config/platform-yandex';
import { MODULE_IDS } from '../../shared/module-ids';
import { toErrorMessage } from '../../shared/errors';

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

interface YandexRewardedVideoCallbacks {
  readonly onOpen?: () => void;
  readonly onRewarded?: () => void;
  readonly onClose?: () => void;
  readonly onError?: (error: unknown) => void;
}

interface YandexAdvApi {
  showRewardedVideo: (options: {
    readonly callbacks?: YandexRewardedVideoCallbacks;
  }) => void | Promise<void>;
}

interface YandexSdkInstance {
  readonly features?: YandexSdkFeatures;
  readonly adv?: YandexAdvApi;
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
  | 'bootstrap-failed'
  | 'bootstrap-skipped'
  | 'dispose'
  | 'gameplay-start-error'
  | 'gameplay-stop-error'
  | 'rewarded-ad-requested'
  | 'rewarded-ad-request-ignored'
  | 'rewarded-ad-open'
  | 'rewarded-ad-rewarded'
  | 'rewarded-ad-close'
  | 'rewarded-ad-error'
  | 'rewarded-ad-no-fill'
  | 'rewarded-ad-ack-dispatched'
  | 'rewarded-ad-ack-dispatch-error';

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
  readonly moduleName: typeof MODULE_IDS.platformYandex;
  bootstrap: () => Promise<void>;
  dispose: () => void;
  getLifecycleLog: () => readonly PlatformLifecycleLogEntry[];
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

function assertTrustedSdkScriptSrc(scriptSrc: string): void {
  const normalizedScriptSrc = scriptSrc.trim();

  if (!normalizedScriptSrc) {
    throw new Error('YaGames SDK script source is empty.');
  }

  if (/[\r\n]/.test(normalizedScriptSrc)) {
    throw new Error('YaGames SDK script source contains unsafe control characters.');
  }

  if (typeof location === 'undefined') {
    if (normalizedScriptSrc !== YANDEX_SDK_SCRIPT_SRC) {
      throw new Error(
        `Untrusted YaGames SDK script source "${normalizedScriptSrc}". Expected "${YANDEX_SDK_SCRIPT_SRC}".`,
      );
    }
    return;
  }

  const expectedUrl = new URL(YANDEX_SDK_SCRIPT_SRC, location.origin);
  let candidateUrl: URL;
  try {
    candidateUrl = new URL(normalizedScriptSrc, location.origin);
  } catch {
    throw new Error(`Invalid YaGames SDK script source "${normalizedScriptSrc}".`);
  }

  if (
    candidateUrl.origin !== expectedUrl.origin ||
    candidateUrl.pathname !== expectedUrl.pathname
  ) {
    throw new Error(
      `Untrusted YaGames SDK script source "${normalizedScriptSrc}". Expected same-origin "${YANDEX_SDK_SCRIPT_SRC}".`,
    );
  }
}

function toAbsoluteUrl(source: string): string {
  if (typeof location === 'undefined') {
    return source;
  }

  return new URL(source, location.origin).toString();
}

function findExistingSdkScript(scriptSrc: string): HTMLScriptElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const taggedScript = document.querySelector<HTMLScriptElement>(
    `script[${YANDEX_SDK_SCRIPT_MARKER_ATTR}="true"]`,
  );

  if (taggedScript) {
    return taggedScript;
  }

  const targetAbsoluteSrc = toAbsoluteUrl(scriptSrc);
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src]');

  for (const script of scripts) {
    if (script.src === targetAbsoluteSrc) {
      return script;
    }
  }

  return null;
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

  const existingSdkScript = findExistingSdkScript(scriptSrc);

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

function isRecordLike(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

const NO_FILL_ERROR_MARKERS = ['no fill', 'no-fill', 'nofill', 'no_fill', 'limit reached'];

function resolveRewardedAdOutcome(error: unknown): RewardedAdOutcome {
  if (!isRecordLike(error)) {
    const message = toErrorMessage(error).toLowerCase();
    return NO_FILL_ERROR_MARKERS.some((marker) => message.includes(marker)) ? 'no-fill' : 'error';
  }

  const messageParts: string[] = [];
  const codeCandidate = error.code;
  const messageCandidate = error.message;
  const nameCandidate = error.name;

  if (typeof codeCandidate === 'string') {
    messageParts.push(codeCandidate.toLowerCase());
  }
  if (typeof messageCandidate === 'string') {
    messageParts.push(messageCandidate.toLowerCase());
  }
  if (typeof nameCandidate === 'string') {
    messageParts.push(nameCandidate.toLowerCase());
  }

  const normalized = messageParts.join(' ');
  return NO_FILL_ERROR_MARKERS.some((marker) => normalized.includes(marker)) ? 'no-fill' : 'error';
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
  let gameplayStarted = false;
  let activeRewardedOperationId: string | null = null;

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

  const startGameplay = async (source: 'bootstrap' | 'resume' | 'rewarded-ad'): Promise<void> => {
    await invokeLifecycleMethod(sdkInstance?.features?.GameplayAPI?.start);
    gameplayStarted = true;
    record('gameplay-start', {
      source,
      hasGameplayApi: Boolean(sdkInstance?.features?.GameplayAPI),
    });
  };

  const stopGameplay = async (
    source: 'pause' | 'dispose' | 'bootstrap-failure' | 'rewarded-ad',
  ): Promise<void> => {
    await invokeLifecycleMethod(sdkInstance?.features?.GameplayAPI?.stop);
    gameplayStarted = false;
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

  const dispatchRewardedAdResult = (
    operationId: string,
    helpType: 'hint' | 'reshuffle',
    outcome: RewardedAdOutcome,
    durationMs: number,
    outcomeContext: string | null,
  ): void => {
    const dispatchResult = commandBus.dispatch({
      type: 'AcknowledgeAdResult',
      helpType,
      outcome,
      operationId,
      durationMs,
      outcomeContext,
    });

    if (dispatchResult.type !== 'ok') {
      record('rewarded-ad-ack-dispatch-error', {
        operationId,
        helpType,
        outcome,
        durationMs,
        code: dispatchResult.error.code,
      });
      return;
    }

    record('rewarded-ad-ack-dispatched', {
      operationId,
      helpType,
      outcome,
      durationMs,
    });
  };

  const processRewardedAdRequest = (operationId: string, helpType: 'hint' | 'reshuffle'): void => {
    if (activeRewardedOperationId) {
      record('rewarded-ad-request-ignored', {
        reason: 'operation-already-running',
        operationId,
        activeRewardedOperationId,
      });
      return;
    }

    activeRewardedOperationId = operationId;
    const requestedAt = now();
    const showRewardedVideo = sdkInstance?.adv?.showRewardedVideo;
    let resolved = false;
    let gameplayStoppedForAd = false;

    const finalize = (outcome: RewardedAdOutcome, outcomeContext: string | null = null): void => {
      if (resolved) {
        return;
      }

      resolved = true;
      const durationMs = Math.max(0, now() - requestedAt);
      dispatchRewardedAdResult(operationId, helpType, outcome, durationMs, outcomeContext);
      activeRewardedOperationId = null;

      if (gameplayStoppedForAd) {
        void startGameplay('rewarded-ad').catch((error: unknown) => {
          record('gameplay-start-error', {
            source: 'rewarded-ad',
            reason: toErrorMessage(error),
          });
        });
      }
    };

    record('rewarded-ad-requested', {
      operationId,
      helpType,
      hasAdvApi: Boolean(showRewardedVideo),
    });

    if (!showRewardedVideo) {
      finalize('error', 'Rewarded ad API is unavailable in SDK runtime.');
      return;
    }

    const stopGameplayForRewardedAd = (): void => {
      if (!gameplayStarted || gameplayStoppedForAd) {
        return;
      }

      gameplayStoppedForAd = true;
      void stopGameplay('rewarded-ad').catch((error: unknown) => {
        gameplayStoppedForAd = false;
        record('gameplay-stop-error', {
          source: 'rewarded-ad',
          reason: toErrorMessage(error),
        });
      });
    };

    try {
      void Promise.resolve(
        showRewardedVideo({
          callbacks: {
            onOpen: () => {
              if (resolved) {
                return;
              }

              record('rewarded-ad-open', {
                operationId,
              });
              stopGameplayForRewardedAd();
            },
            onRewarded: () => {
              if (resolved) {
                return;
              }

              record('rewarded-ad-rewarded', {
                operationId,
              });
              finalize('reward');
            },
            onClose: () => {
              if (resolved) {
                return;
              }

              record('rewarded-ad-close', {
                operationId,
              });
              finalize('close');
            },
            onError: (error: unknown) => {
              if (resolved) {
                return;
              }

              const outcome = resolveRewardedAdOutcome(error);
              const reason = toErrorMessage(error);
              record(outcome === 'no-fill' ? 'rewarded-ad-no-fill' : 'rewarded-ad-error', {
                operationId,
                reason,
              });
              finalize(outcome, reason);
            },
          },
        }),
      ).catch((error: unknown) => {
        if (resolved) {
          return;
        }

        const outcome = resolveRewardedAdOutcome(error);
        const reason = toErrorMessage(error);
        record(outcome === 'no-fill' ? 'rewarded-ad-no-fill' : 'rewarded-ad-error', {
          operationId,
          reason,
        });
        finalize(outcome, reason);
      });
    } catch (error: unknown) {
      if (resolved) {
        return;
      }

      const outcome = resolveRewardedAdOutcome(error);
      const reason = toErrorMessage(error);
      record(outcome === 'no-fill' ? 'rewarded-ad-no-fill' : 'rewarded-ad-error', {
        operationId,
        reason,
      });
      finalize(outcome, reason);
    }
  };

  const handleApplicationEvent = (event: ApplicationEvent): void => {
    if (event.eventType === 'application/runtime-ready') {
      record('application-runtime-ready-observed', {
        at: event.occurredAt,
      });
      return;
    }

    if (event.eventType !== 'domain/help') {
      return;
    }

    if (event.payload.phase !== 'requested' || !event.payload.requiresAd) {
      return;
    }

    processRewardedAdRequest(event.payload.operationId, event.payload.helpKind);
  };

  return {
    moduleName: MODULE_IDS.platformYandex,
    bootstrap: async () => {
      if (bootstrapped) {
        record('bootstrap-skipped', {
          reason: 'already-bootstrapped',
        });
        return;
      }

      if (!unsubscribeApplicationEvents) {
        unsubscribeApplicationEvents = eventBus.subscribe(handleApplicationEvent);
      }

      try {
        if (!options.resolveSdkInstance) {
          assertTrustedSdkScriptSrc(sdkScriptSrc);
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
      } catch (error: unknown) {
        record('bootstrap-failed', {
          reason: toErrorMessage(error),
        });

        unsubscribeLifecycleEvents?.();
        unsubscribeLifecycleEvents = null;

        if (sdkInstance && gameplayStarted) {
          try {
            await stopGameplay('bootstrap-failure');
          } catch (stopError: unknown) {
            record('gameplay-stop-error', {
              source: 'bootstrap-failure',
              reason: toErrorMessage(stopError),
            });
          }
        }

        unsubscribeApplicationEvents?.();
        unsubscribeApplicationEvents = null;

        sdkInstance = null;
        gameplayStarted = false;
        bootstrapped = false;
        activeRewardedOperationId = null;

        throw error;
      }
    },
    dispose: () => {
      unsubscribeLifecycleEvents?.();
      unsubscribeLifecycleEvents = null;

      unsubscribeApplicationEvents?.();
      unsubscribeApplicationEvents = null;

      if (sdkInstance && gameplayStarted) {
        void stopGameplay('dispose').catch((error: unknown) => {
          record('gameplay-stop-error', {
            source: 'dispose',
            reason: toErrorMessage(error),
          });
        });
      }

      sdkInstance = null;
      gameplayStarted = false;
      bootstrapped = false;
      activeRewardedOperationId = null;

      record('dispose');
    },
    getLifecycleLog: () => lifecycleLog,
  };
}
