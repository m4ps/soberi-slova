import type {
  ApplicationEvent,
  ApplicationEventBus,
  ApplicationReadModel,
} from '../../application';
import { MODULE_IDS } from '../../shared/module-ids';
import { isRecordLike, parseNonNegativeSafeInteger } from '../../shared/runtime-guards';

const INSTALL_STATE_STORAGE_KEY = 'endless-word-grid.telemetry.install-state.v1';
const DAY_MS = 24 * 60 * 60 * 1000;

const HELP_ACTION_SHARE_THRESHOLDS = Object.freeze({
  monitor: 0.2,
  alert: 0.35,
});

const DISPLAYED_TARGET_FIND_TIME_THRESHOLDS = Object.freeze({
  monitor: 20_000,
  alert: 45_000,
});

const AD_FAILURE_RATE_THRESHOLDS = Object.freeze({
  monitor: 0.2,
  alert: 0.4,
});

const LEADERBOARD_SYNC_SUCCESS_THRESHOLDS = Object.freeze({
  monitor: 0.9,
  alert: 0.75,
});

const ERROR_RATE_THRESHOLDS = Object.freeze({
  monitor: 0.05,
  alert: 0.15,
});

export type TelemetryGuardrailStatus = 'ok' | 'monitor' | 'alert' | 'insufficient-data';

export interface TelemetryStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface TelemetryInstallState {
  readonly installId: string;
  readonly firstSeenDayNumber: number;
  readonly lastSeenDayNumber: number;
  readonly sessionCount: number;
}

interface TelemetryActiveDisplayedTarget {
  readonly levelId: string;
  readonly targetWordId: string;
  readonly startedAt: number;
}

export interface TelemetryErrorRateEntry {
  readonly code: string;
  readonly count: number;
  readonly rate: number;
}

export interface TelemetryErrorRateGuardrailEntry extends TelemetryErrorRateEntry {
  readonly status: TelemetryGuardrailStatus;
  readonly thresholds: {
    readonly monitor: number;
    readonly alert: number;
  };
}

export interface TelemetryGuardrailMetric {
  readonly value: number | null;
  readonly status: TelemetryGuardrailStatus;
  readonly thresholds: {
    readonly monitor: number;
    readonly alert: number;
  } | null;
}

export interface TelemetryGuardrailSnapshot {
  readonly helpActionShare: TelemetryGuardrailMetric;
  readonly meanDisplayedTargetFindTimeMs: TelemetryGuardrailMetric;
  readonly restoreSuccessRate: TelemetryGuardrailMetric;
  readonly adFailureRate: TelemetryGuardrailMetric;
  readonly leaderboardSyncSuccessRate: TelemetryGuardrailMetric;
  readonly errorRateByCode: readonly TelemetryErrorRateGuardrailEntry[];
}

export interface TelemetrySessionSnapshot {
  readonly sessionId: string;
  readonly installId: string;
  readonly sessionOrdinal: number;
  readonly startedAt: number;
  readonly sessionLengthMs: number;
  readonly retentionDay: number;
  readonly usedAnyHelp: boolean;
  readonly helpActionCount: number;
  readonly helpActionShare: number;
  readonly helpActionsByKind: {
    readonly hint: number;
    readonly reshuffle: number;
  };
  readonly displayedTargets: {
    readonly exposureCount: number;
    readonly resolvedCount: number;
    readonly meanTimeToFindMs: number | null;
    readonly activeTargetWordId: string | null;
    readonly activeLevelId: string | null;
  };
  readonly restore: {
    readonly attemptCount: number;
    readonly successCount: number;
    readonly levelRestoredCount: number;
    readonly successRate: number | null;
  };
  readonly ads: {
    readonly totalCount: number;
    readonly rewardCount: number;
    readonly closeCount: number;
    readonly errorCount: number;
    readonly noFillCount: number;
    readonly noRewardRate: number | null;
    readonly meanDurationMs: number | null;
  };
  readonly leaderboardSync: {
    readonly successCount: number;
    readonly failedCount: number;
    readonly skippedCount: number;
    readonly successRate: number | null;
  };
  readonly commands: {
    readonly attemptCount: number;
    readonly failureCount: number;
    readonly errorRateByCode: readonly TelemetryErrorRateEntry[];
  };
  readonly guardrails: TelemetryGuardrailSnapshot;
}

type TelemetryRecordType =
  | 'telemetry/session-started'
  | 'telemetry/session-summary'
  | 'telemetry/guardrail-snapshot';

interface TelemetryRecordEnvelope<TType extends TelemetryRecordType, TPayload> {
  readonly recordId: string;
  readonly recordType: TType;
  readonly recordVersion: number;
  readonly recordedAt: number;
  readonly correlationId: string;
  readonly payload: TPayload;
}

export type TelemetrySessionStartedRecord = TelemetryRecordEnvelope<
  'telemetry/session-started',
  {
    readonly sessionId: string;
    readonly installId: string;
    readonly sessionOrdinal: number;
    readonly startedAt: number;
    readonly retentionDay: number;
    readonly firstSeenDayNumber: number;
  }
>;

export type TelemetrySessionSummaryRecord = TelemetryRecordEnvelope<
  'telemetry/session-summary',
  TelemetrySessionSnapshot
>;

export type TelemetryGuardrailSnapshotRecord = TelemetryRecordEnvelope<
  'telemetry/guardrail-snapshot',
  {
    readonly sessionId: string;
    readonly sessionLengthMs: number;
    readonly guardrails: TelemetryGuardrailSnapshot;
  }
>;

export type TelemetryRecord =
  | TelemetrySessionStartedRecord
  | TelemetrySessionSummaryRecord
  | TelemetryGuardrailSnapshotRecord;

export interface TelemetryModuleOptions {
  readonly now?: () => number;
  readonly storage?: TelemetryStorageLike | null;
  readonly getCurrentCoreState?: ApplicationReadModel['getCoreState'];
}

export interface TelemetryModule {
  readonly moduleName: typeof MODULE_IDS.telemetry;
  start: () => void;
  stop: () => void;
  syncStateFromReadModel: (capturedAt?: number) => void;
  getBufferedEvents: () => readonly ApplicationEvent[];
  getBufferedRecords: () => readonly TelemetryRecord[];
  getSessionSnapshot: () => TelemetrySessionSnapshot;
}

const TELEMETRY_RECORD_VERSIONS: Readonly<Record<TelemetryRecordType, number>> = {
  'telemetry/session-started': 1,
  'telemetry/session-summary': 1,
  'telemetry/guardrail-snapshot': 1,
};

function resolveStorage(
  storage: TelemetryStorageLike | null | undefined,
): TelemetryStorageLike | null {
  if (storage !== undefined) {
    return storage;
  }

  const runtime = globalThis as typeof globalThis & {
    localStorage?: TelemetryStorageLike;
  };

  return runtime.localStorage ?? null;
}

function createOpaqueId(prefix: string, nowTs: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${nowTs}-${Math.random().toString(36).slice(2, 10)}`;
}

function toUtcDayNumber(timestampMs: number): number {
  return Math.floor(timestampMs / DAY_MS);
}

function loadInstallState(
  storage: TelemetryStorageLike | null,
  nowTs: number,
): TelemetryInstallState {
  const currentDayNumber = toUtcDayNumber(nowTs);

  if (!storage) {
    return {
      installId: createOpaqueId('anon-install', nowTs),
      firstSeenDayNumber: currentDayNumber,
      lastSeenDayNumber: currentDayNumber,
      sessionCount: 1,
    };
  }

  try {
    const serialized = storage.getItem(INSTALL_STATE_STORAGE_KEY);
    if (!serialized) {
      throw new Error('missing-install-state');
    }

    const parsed = JSON.parse(serialized);
    if (!isRecordLike(parsed)) {
      throw new Error('invalid-install-state');
    }

    const firstSeenDayNumber = parseNonNegativeSafeInteger(parsed.firstSeenDayNumber);
    const lastSeenDayNumber = parseNonNegativeSafeInteger(parsed.lastSeenDayNumber);
    const sessionCount = parseNonNegativeSafeInteger(parsed.sessionCount);
    const installId =
      typeof parsed.installId === 'string' && parsed.installId.trim().length > 0
        ? parsed.installId.trim()
        : null;

    if (
      installId === null ||
      firstSeenDayNumber === null ||
      lastSeenDayNumber === null ||
      sessionCount === null
    ) {
      throw new Error('invalid-install-state-shape');
    }

    const nextState: TelemetryInstallState = {
      installId,
      firstSeenDayNumber,
      lastSeenDayNumber: Math.max(lastSeenDayNumber, currentDayNumber),
      sessionCount: sessionCount + 1,
    };

    try {
      storage.setItem(INSTALL_STATE_STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // Best-effort persistence only.
    }

    return nextState;
  } catch {
    const nextState: TelemetryInstallState = {
      installId: createOpaqueId('anon-install', nowTs),
      firstSeenDayNumber: currentDayNumber,
      lastSeenDayNumber: currentDayNumber,
      sessionCount: 1,
    };

    try {
      storage.setItem(INSTALL_STATE_STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // Best-effort persistence only.
    }

    return nextState;
  }
}

function calculateRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

function roundMetric(value: number | null, digits = 4): number | null {
  if (value === null) {
    return null;
  }

  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function createMetricGuardrail(
  value: number | null,
  thresholds: { readonly monitor: number; readonly alert: number } | null,
  comparator: 'higher-is-worse' | 'lower-is-worse' = 'higher-is-worse',
): TelemetryGuardrailMetric {
  if (value === null || thresholds === null) {
    return {
      value,
      status: 'insufficient-data',
      thresholds,
    };
  }

  const status =
    comparator === 'higher-is-worse'
      ? value >= thresholds.alert
        ? 'alert'
        : value >= thresholds.monitor
          ? 'monitor'
          : 'ok'
      : value <= thresholds.alert
        ? 'alert'
        : value <= thresholds.monitor
          ? 'monitor'
          : 'ok';

  return {
    value: roundMetric(value),
    status,
    thresholds,
  };
}

export function createTelemetryModule(
  eventBus: ApplicationEventBus,
  options: TelemetryModuleOptions = {},
): TelemetryModule {
  const bufferedEvents: ApplicationEvent[] = [];
  const bufferedRecords: TelemetryRecord[] = [];
  const now = options.now ?? Date.now;
  const storage = resolveStorage(options.storage);
  const sessionStartedAt = now();
  const installState = loadInstallState(storage, sessionStartedAt);
  const sessionId = createOpaqueId('session', sessionStartedAt);
  const retentionDay = Math.max(
    0,
    toUtcDayNumber(sessionStartedAt) - installState.firstSeenDayNumber,
  );

  let unsubscribe: (() => void) | null = null;
  let telemetryRecordSequence = 0;
  let sessionFinalized = false;
  let commandAttemptCount = 0;
  let commandFailureCount = 0;
  const errorCounts = new Map<string, number>();
  let helpActionCount = 0;
  let usedAnyHelp = false;
  let hintHelpCount = 0;
  let reshuffleHelpCount = 0;
  let displayedTargetExposureCount = 0;
  let displayedTargetResolvedCount = 0;
  let displayedTargetFindTotalMs = 0;
  let activeDisplayedTarget: TelemetryActiveDisplayedTarget | null = null;
  let restoreAttemptCount = 0;
  let restoreSuccessCount = 0;
  let restoreLevelRestoredCount = 0;
  let adRewardCount = 0;
  let adCloseCount = 0;
  let adErrorCount = 0;
  let adNoFillCount = 0;
  let adDurationCount = 0;
  let adDurationTotalMs = 0;
  let leaderboardSyncSuccessCount = 0;
  let leaderboardSyncFailedCount = 0;
  let leaderboardSyncSkippedCount = 0;

  function createRecord(
    recordType: 'telemetry/session-started',
    correlationId: string,
    payload: TelemetrySessionStartedRecord['payload'],
  ): TelemetrySessionStartedRecord;
  function createRecord(
    recordType: 'telemetry/session-summary',
    correlationId: string,
    payload: TelemetrySessionSummaryRecord['payload'],
  ): TelemetrySessionSummaryRecord;
  function createRecord(
    recordType: 'telemetry/guardrail-snapshot',
    correlationId: string,
    payload: TelemetryGuardrailSnapshotRecord['payload'],
  ): TelemetryGuardrailSnapshotRecord;
  function createRecord(
    recordType: TelemetryRecordType,
    correlationId: string,
    payload: TelemetryRecord['payload'],
  ): TelemetryRecord {
    telemetryRecordSequence += 1;
    const recordedAt = now();

    return {
      recordId: `telemetry-${recordedAt}-${telemetryRecordSequence}`,
      recordType,
      recordVersion: TELEMETRY_RECORD_VERSIONS[recordType],
      recordedAt,
      correlationId,
      payload,
    } as TelemetryRecord;
  }

  const startDisplayedTargetTracking = (
    levelId: string,
    targetWordId: string,
    startedAt: number,
  ): void => {
    if (
      activeDisplayedTarget &&
      activeDisplayedTarget.levelId === levelId &&
      activeDisplayedTarget.targetWordId === targetWordId
    ) {
      return;
    }

    activeDisplayedTarget = {
      levelId,
      targetWordId,
      startedAt,
    };
    displayedTargetExposureCount += 1;
  };

  const buildErrorRateEntries = (): readonly TelemetryErrorRateEntry[] => {
    return [...errorCounts.entries()]
      .sort(([leftCode], [rightCode]) => leftCode.localeCompare(rightCode))
      .map(([code, count]) => {
        return {
          code,
          count,
          rate: roundMetric(count / Math.max(1, commandAttemptCount)) ?? 0,
        };
      });
  };

  const buildGuardrails = (): TelemetryGuardrailSnapshot => {
    const helpActionShare = calculateRate(
      helpActionCount,
      Math.max(1, displayedTargetExposureCount),
    );
    const meanDisplayedTargetFindTimeMs =
      displayedTargetResolvedCount > 0
        ? displayedTargetFindTotalMs / displayedTargetResolvedCount
        : null;
    const restoreSuccessRate = calculateRate(restoreSuccessCount, restoreAttemptCount);
    const adFailureRate = calculateRate(
      adCloseCount + adErrorCount + adNoFillCount,
      adRewardCount + adCloseCount + adErrorCount + adNoFillCount,
    );
    const leaderboardSyncSuccessRate = calculateRate(
      leaderboardSyncSuccessCount,
      leaderboardSyncSuccessCount + leaderboardSyncFailedCount,
    );

    return {
      helpActionShare: createMetricGuardrail(helpActionShare, HELP_ACTION_SHARE_THRESHOLDS),
      meanDisplayedTargetFindTimeMs: createMetricGuardrail(
        meanDisplayedTargetFindTimeMs,
        DISPLAYED_TARGET_FIND_TIME_THRESHOLDS,
      ),
      restoreSuccessRate: createMetricGuardrail(
        restoreSuccessRate,
        {
          monitor: 0.999,
          alert: 0.5,
        },
        'lower-is-worse',
      ),
      adFailureRate: createMetricGuardrail(adFailureRate, AD_FAILURE_RATE_THRESHOLDS),
      leaderboardSyncSuccessRate: createMetricGuardrail(
        leaderboardSyncSuccessRate,
        LEADERBOARD_SYNC_SUCCESS_THRESHOLDS,
        'lower-is-worse',
      ),
      errorRateByCode: buildErrorRateEntries().map((entry) => {
        const metric = createMetricGuardrail(entry.rate, ERROR_RATE_THRESHOLDS);
        return {
          ...entry,
          status: metric.status,
          thresholds: ERROR_RATE_THRESHOLDS,
        };
      }),
    };
  };

  const buildSessionSnapshot = (): TelemetrySessionSnapshot => {
    const helpActionShare = calculateRate(
      helpActionCount,
      Math.max(1, displayedTargetExposureCount),
    );
    const meanDisplayedTargetFindTimeMs =
      displayedTargetResolvedCount > 0
        ? displayedTargetFindTotalMs / displayedTargetResolvedCount
        : null;
    const restoreSuccessRate = calculateRate(restoreSuccessCount, restoreAttemptCount);
    const totalAdOutcomes = adRewardCount + adCloseCount + adErrorCount + adNoFillCount;
    const noRewardRate = calculateRate(
      adCloseCount + adErrorCount + adNoFillCount,
      totalAdOutcomes,
    );
    const leaderboardSyncSuccessRate = calculateRate(
      leaderboardSyncSuccessCount,
      leaderboardSyncSuccessCount + leaderboardSyncFailedCount,
    );

    return {
      sessionId,
      installId: installState.installId,
      sessionOrdinal: installState.sessionCount,
      startedAt: sessionStartedAt,
      sessionLengthMs: Math.max(0, now() - sessionStartedAt),
      retentionDay,
      usedAnyHelp,
      helpActionCount,
      helpActionShare: roundMetric(helpActionShare) ?? 0,
      helpActionsByKind: {
        hint: hintHelpCount,
        reshuffle: reshuffleHelpCount,
      },
      displayedTargets: {
        exposureCount: displayedTargetExposureCount,
        resolvedCount: displayedTargetResolvedCount,
        meanTimeToFindMs: roundMetric(meanDisplayedTargetFindTimeMs, 2),
        activeTargetWordId: activeDisplayedTarget?.targetWordId ?? null,
        activeLevelId: activeDisplayedTarget?.levelId ?? null,
      },
      restore: {
        attemptCount: restoreAttemptCount,
        successCount: restoreSuccessCount,
        levelRestoredCount: restoreLevelRestoredCount,
        successRate: roundMetric(restoreSuccessRate),
      },
      ads: {
        totalCount: totalAdOutcomes,
        rewardCount: adRewardCount,
        closeCount: adCloseCount,
        errorCount: adErrorCount,
        noFillCount: adNoFillCount,
        noRewardRate: roundMetric(noRewardRate),
        meanDurationMs:
          adDurationCount > 0 ? Math.round(adDurationTotalMs / adDurationCount) : null,
      },
      leaderboardSync: {
        successCount: leaderboardSyncSuccessCount,
        failedCount: leaderboardSyncFailedCount,
        skippedCount: leaderboardSyncSkippedCount,
        successRate: roundMetric(leaderboardSyncSuccessRate),
      },
      commands: {
        attemptCount: commandAttemptCount,
        failureCount: commandFailureCount,
        errorRateByCode: buildErrorRateEntries(),
      },
      guardrails: buildGuardrails(),
    };
  };

  const finalizeSession = (): void => {
    if (sessionFinalized) {
      return;
    }

    sessionFinalized = true;
    const summary = buildSessionSnapshot();
    bufferedRecords.push(createRecord('telemetry/session-summary', sessionId, summary));
    bufferedRecords.push(
      createRecord('telemetry/guardrail-snapshot', sessionId, {
        sessionId,
        sessionLengthMs: summary.sessionLengthMs,
        guardrails: summary.guardrails,
      }),
    );
  };

  const syncStateFromReadModel = (capturedAt = now()): void => {
    const snapshot = options.getCurrentCoreState?.();
    if (!snapshot || snapshot.runtimeMode !== 'ready') {
      return;
    }

    const targetWordId = snapshot.gameState.currentDisplayedTargetId;
    if (!targetWordId) {
      activeDisplayedTarget = null;
      return;
    }

    startDisplayedTargetTracking(snapshot.gameplay.levelId, targetWordId, capturedAt);
  };

  const handleEvent = (event: ApplicationEvent): void => {
    bufferedEvents.push(event);

    if (event.eventType === 'application/command-routed') {
      commandAttemptCount += 1;
      return;
    }

    if (event.eventType === 'application/command-failed') {
      commandAttemptCount += 1;
      commandFailureCount += 1;
      errorCounts.set(event.payload.code, (errorCounts.get(event.payload.code) ?? 0) + 1);
      return;
    }

    if (event.eventType === 'domain/help' && event.payload.phase === 'ad-result') {
      if (event.payload.durationMs !== null) {
        adDurationCount += 1;
        adDurationTotalMs += event.payload.durationMs;
      }

      if (event.payload.outcome === 'reward') {
        adRewardCount += 1;
      } else if (event.payload.outcome === 'close') {
        adCloseCount += 1;
      } else if (event.payload.outcome === 'error') {
        adErrorCount += 1;
      } else if (event.payload.outcome === 'no-fill') {
        adNoFillCount += 1;
      }

      if (event.payload.applied) {
        usedAnyHelp = true;
        helpActionCount += 1;
        if (event.payload.helpKind === 'hint') {
          hintHelpCount += 1;
        } else {
          reshuffleHelpCount += 1;
        }
      }
      return;
    }

    if (event.eventType === 'domain/displayed-target-changed') {
      const previousTargetMatched =
        activeDisplayedTarget?.levelId === event.payload.previousLevelId &&
        activeDisplayedTarget?.targetWordId === event.payload.previousTargetWordId;

      if (
        event.payload.reason === 'target-accepted' &&
        previousTargetMatched &&
        activeDisplayedTarget
      ) {
        displayedTargetResolvedCount += 1;
        displayedTargetFindTotalMs += Math.max(
          0,
          event.occurredAt - activeDisplayedTarget.startedAt,
        );
      }

      activeDisplayedTarget = null;

      if (event.payload.nextTargetWordId) {
        startDisplayedTargetTracking(
          event.payload.nextLevelId,
          event.payload.nextTargetWordId,
          event.occurredAt,
        );
      }
      return;
    }

    if (event.eventType === 'domain/persistence') {
      restoreAttemptCount += 1;
      if (event.payload.restored) {
        restoreSuccessCount += 1;
      }
      if (event.payload.levelRestored) {
        restoreLevelRestoredCount += 1;
      }

      if (event.payload.restoredDisplayedTargetId) {
        startDisplayedTargetTracking(
          event.payload.restoredLevelId,
          event.payload.restoredDisplayedTargetId,
          event.occurredAt,
        );
      } else {
        activeDisplayedTarget = null;
      }
      return;
    }

    if (event.eventType === 'platform/leaderboard-sync-result') {
      if (event.payload.status === 'success') {
        leaderboardSyncSuccessCount += 1;
      } else if (event.payload.status === 'failed') {
        leaderboardSyncFailedCount += 1;
      } else {
        leaderboardSyncSkippedCount += 1;
      }
    }
  };

  return {
    moduleName: MODULE_IDS.telemetry,
    start: () => {
      if (unsubscribe) {
        return;
      }

      bufferedRecords.push(
        createRecord('telemetry/session-started', sessionId, {
          sessionId,
          installId: installState.installId,
          sessionOrdinal: installState.sessionCount,
          startedAt: sessionStartedAt,
          retentionDay,
          firstSeenDayNumber: installState.firstSeenDayNumber,
        }),
      );

      unsubscribe = eventBus.subscribe(handleEvent);
    },
    stop: () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }

      finalizeSession();
    },
    syncStateFromReadModel,
    getBufferedEvents: () => bufferedEvents,
    getBufferedRecords: () => bufferedRecords,
    getSessionSnapshot: () => buildSessionSnapshot(),
  };
}
