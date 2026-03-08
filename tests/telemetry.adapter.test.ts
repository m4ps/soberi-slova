import { describe, expect, it } from 'vitest';

import { createTelemetryModule } from '../src/adapters/Telemetry';
import type { ApplicationEvent, ApplicationEventBus } from '../src/application';
import { createCoreStateModule } from '../src/domain/CoreState';
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

describe('Telemetry adapter', () => {
  it('builds session summary and guardrails from typed runtime events without PII', () => {
    let nowTs = 86_500_000;
    const storageState = new Map<string, string>();
    storageState.set(
      'endless-word-grid.telemetry.install-state.v1',
      JSON.stringify({
        installId: 'anon-install-existing',
        firstSeenDayNumber: 0,
        lastSeenDayNumber: 0,
        sessionCount: 2,
      }),
    );

    const coreState = createCoreStateModule({
      initialMode: 'ready',
      initialGameState: {
        ...createNearCompletionFixtureState({
          levelId: 'level-telemetry',
          source: 'telemetry-test',
          seed: 11,
        }),
        currentDisplayedTargetId: 'дом',
        currentHintPathProgress: 0,
      },
      nowProvider: () => nowTs,
    });
    const eventBus = createEventBus();
    const telemetry = createTelemetryModule(eventBus, {
      now: () => nowTs,
      storage: {
        getItem: (key) => storageState.get(key) ?? null,
        setItem: (key, value) => {
          storageState.set(key, value);
        },
      },
      getCurrentCoreState: coreState.getSnapshot,
    });

    telemetry.start();
    telemetry.syncStateFromReadModel();

    nowTs = 86_500_500;
    eventBus.publish({
      eventId: 'evt-command-routed',
      eventType: 'application/command-routed',
      eventVersion: 1,
      occurredAt: nowTs,
      correlationId: 'corr-routed',
      payload: {
        commandType: 'SubmitPath',
      },
    });

    nowTs = 86_501_000;
    eventBus.publish({
      eventId: 'evt-command-failed',
      eventType: 'application/command-failed',
      eventVersion: 1,
      occurredAt: nowTs,
      correlationId: 'corr-error',
      payload: {
        commandType: 'SubmitPath',
        errorType: 'domainError',
        code: 'submit-path.empty',
        retryable: false,
      },
    });

    nowTs = 86_502_000;
    eventBus.publish({
      eventId: 'evt-help-result',
      eventType: 'domain/help',
      eventVersion: 1,
      occurredAt: nowTs,
      correlationId: 'corr-help',
      payload: {
        phase: 'ad-result',
        commandType: 'AcknowledgeAdResult',
        operationId: 'corr-help',
        helpKind: 'hint',
        outcome: 'reward',
        applied: true,
        durationMs: 300,
        outcomeContext: null,
        cooldownApplied: false,
        cooldownDurationMs: 0,
        toastMessage: null,
        technicalErrorPolicy: null,
      },
    });

    nowTs = 86_515_000;
    eventBus.publish({
      eventId: 'evt-target-changed',
      eventType: 'domain/displayed-target-changed',
      eventVersion: 1,
      occurredAt: nowTs,
      correlationId: 'corr-target',
      payload: {
        commandType: 'SubmitPath',
        reason: 'target-accepted',
        previousLevelId: 'level-telemetry',
        nextLevelId: 'level-telemetry',
        previousTargetWordId: 'дом',
        nextTargetWordId: 'нос',
        previousHintPathProgress: 0,
        nextHintPathProgress: 0,
        stateVersion: 2,
        progress: {
          foundTargets: 9,
          totalTargets: 10,
        },
      },
    });

    nowTs = 86_515_100;
    eventBus.publish({
      eventId: 'evt-restore',
      eventType: 'domain/persistence',
      eventVersion: 1,
      occurredAt: nowTs,
      correlationId: 'corr-restore',
      payload: {
        commandType: 'RestoreSession',
        operation: 'restore-session',
        restored: true,
        levelRestored: true,
        source: 'local',
        localSnapshotAvailable: true,
        cloudSnapshotAvailable: false,
        cloudAllTimeScoreAvailable: false,
        restoredAllTimeScore: 7,
        restoredStateVersion: 2,
        restoredLevelId: 'level-telemetry',
        restoredDisplayedTargetId: 'нос',
        restoredHintPathProgress: 0,
      },
    });

    nowTs = 86_515_200;
    eventBus.publish({
      eventId: 'evt-leaderboard-result',
      eventType: 'platform/leaderboard-sync-result',
      eventVersion: 1,
      occurredAt: nowTs,
      correlationId: 'corr-leaderboard',
      payload: {
        trigger: 'manual',
        triggerEventType: 'domain/leaderboard-sync',
        score: 42,
        status: 'success',
        attempt: 1,
        totalAttempts: 1,
        reason: null,
      },
    });

    nowTs = 86_520_000;
    telemetry.stop();

    const sessionStartedRecord = telemetry
      .getBufferedRecords()
      .find((record) => record.recordType === 'telemetry/session-started');
    const sessionSummaryRecord = telemetry
      .getBufferedRecords()
      .find((record) => record.recordType === 'telemetry/session-summary');
    const guardrailRecord = telemetry
      .getBufferedRecords()
      .find((record) => record.recordType === 'telemetry/guardrail-snapshot');

    expect(sessionStartedRecord).toMatchObject({
      correlationId: expect.any(String),
      payload: {
        installId: 'anon-install-existing',
        sessionOrdinal: 3,
        retentionDay: 1,
      },
    });
    expect(sessionSummaryRecord).toMatchObject({
      correlationId: expect.any(String),
      payload: {
        installId: 'anon-install-existing',
        sessionOrdinal: 3,
        sessionLengthMs: 20_000,
        retentionDay: 1,
        usedAnyHelp: true,
        helpActionCount: 1,
        helpActionShare: 0.5,
        displayedTargets: {
          exposureCount: 2,
          resolvedCount: 1,
          meanTimeToFindMs: 15_000,
          activeTargetWordId: 'нос',
          activeLevelId: 'level-telemetry',
        },
        restore: {
          attemptCount: 1,
          successCount: 1,
          levelRestoredCount: 1,
          successRate: 1,
        },
        ads: {
          totalCount: 1,
          rewardCount: 1,
          closeCount: 0,
          errorCount: 0,
          noFillCount: 0,
          noRewardRate: 0,
          meanDurationMs: 300,
        },
        leaderboardSync: {
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
          successRate: 1,
        },
        commands: {
          attemptCount: 2,
          failureCount: 1,
          errorRateByCode: [
            {
              code: 'submit-path.empty',
              count: 1,
              rate: 0.5,
            },
          ],
        },
        guardrails: {
          helpActionShare: {
            value: 0.5,
            status: 'alert',
          },
          meanDisplayedTargetFindTimeMs: {
            value: 15_000,
            status: 'ok',
          },
          leaderboardSyncSuccessRate: {
            value: 1,
            status: 'ok',
          },
        },
      },
    });
    expect(guardrailRecord).toMatchObject({
      correlationId: expect.any(String),
      payload: {
        sessionLengthMs: 20_000,
        guardrails: {
          helpActionShare: {
            status: 'alert',
          },
          errorRateByCode: [
            {
              code: 'submit-path.empty',
              rate: 0.5,
              status: 'alert',
            },
          ],
        },
      },
    });
  });
});
