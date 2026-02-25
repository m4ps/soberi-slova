import { describe, expect, it } from 'vitest';

import {
  createApplicationLayer,
  type ApplicationCommand,
  type ApplicationEvent,
} from '../src/application';
import { createCoreStateModule } from '../src/domain/CoreState';
import type { GameStateInput } from '../src/domain/GameState';
import { createHelpEconomyModule } from '../src/domain/HelpEconomy';
import { createWordValidationModule } from '../src/domain/WordValidation';

function createSmokeApplication() {
  return createApplicationLayer({
    coreState: createCoreStateModule(),
    helpEconomy: createHelpEconomyModule(0),
  });
}

function createScoringFixtureState(): GameStateInput {
  return {
    schemaVersion: 2,
    stateVersion: 0,
    updatedAt: 1_000,
    allTimeScore: 0,
    currentLevelSession: {
      levelId: 'level-command-bus',
      grid: [
        'д',
        'о',
        'м',
        'к',
        'о',
        'т',
        'н',
        'о',
        'с',
        'а',
        'л',
        'и',
        'м',
        'р',
        'е',
        'п',
        'у',
        'т',
        'ь',
        'я',
        'б',
        'в',
        'г',
        'ё',
        'ж',
      ],
      targetWords: ['дом', 'нос', 'сон'],
      foundTargets: [],
      foundBonuses: [],
      status: 'active',
      seed: 9,
      meta: {
        source: 'command-bus-test',
      },
    },
    helpWindow: {
      windowStartTs: 1_000,
      freeActionAvailable: true,
      pendingHelpRequest: null,
    },
    pendingOps: [],
    leaderboardSync: {
      lastSubmittedScore: 0,
      lastAckScore: 0,
      lastSubmitTs: 0,
    },
  };
}

describe('application command/query bus smoke', () => {
  it('routes required v1 commands through a single command bus', () => {
    const application = createSmokeApplication();
    const events: ApplicationEvent[] = [];
    application.events.subscribe((event) => {
      events.push(event);
    });
    const commandAcks: Array<{ commandType: ApplicationCommand['type']; correlationId: string }> =
      [];

    const commands: ApplicationCommand[] = [
      { type: 'RuntimeReady' },
      { type: 'SubmitPath', pathCells: [{ row: 0, col: 0 }] },
      { type: 'RequestHint' },
      { type: 'RequestReshuffle' },
      {
        type: 'AcknowledgeAdResult',
        helpType: 'hint',
        outcome: 'reward',
        operationId: 'op-ad',
      },
      {
        type: 'AcknowledgeWordSuccessAnimation',
        wordId: 'word-1',
        operationId: 'op-word',
      },
      {
        type: 'AcknowledgeLevelTransitionDone',
        operationId: 'op-transition',
      },
      { type: 'Tick', nowTs: 123_456 },
      { type: 'RestoreSession' },
      { type: 'SyncLeaderboard' },
    ];

    for (const command of commands) {
      const result = application.commands.dispatch(command);
      expect(result.type).toBe('ok');
      if (result.type === 'ok') {
        commandAcks.push({
          commandType: result.value.commandType,
          correlationId: result.value.correlationId,
        });
      }
    }

    const coreStateResult = application.queries.execute({ type: 'GetCoreState' });
    expect(coreStateResult.type).toBe('ok');
    if (coreStateResult.type === 'ok') {
      expect(coreStateResult.value.runtimeMode).toBe('ready');
    }

    const helpWindowResult = application.queries.execute({ type: 'GetHelpWindowState' });
    expect(helpWindowResult.type).toBe('ok');
    if (helpWindowResult.type === 'ok') {
      expect(typeof helpWindowResult.value.freeActionAvailable).toBe('boolean');
      expect(helpWindowResult.value.windowStartTs).toBeGreaterThanOrEqual(0);
      expect(typeof helpWindowResult.value.isLocked).toBe('boolean');
      if (helpWindowResult.value.isLocked) {
        expect(helpWindowResult.value.pendingRequest).not.toBeNull();
      }
    }

    const routedCommandTypes = events
      .filter(
        (
          event,
        ): event is Extract<ApplicationEvent, { eventType: 'application/command-routed' }> => {
          return event.eventType === 'application/command-routed';
        },
      )
      .map((event) => event.payload.commandType);

    expect(routedCommandTypes).toEqual(
      expect.arrayContaining([
        'SubmitPath',
        'RequestHint',
        'RequestReshuffle',
        'AcknowledgeAdResult',
        'AcknowledgeWordSuccessAnimation',
        'AcknowledgeLevelTransitionDone',
        'RestoreSession',
        'SyncLeaderboard',
      ]),
    );

    events.forEach((event) => {
      expect(event).toEqual(
        expect.objectContaining({
          eventId: expect.any(String),
          eventVersion: 1,
          occurredAt: expect.any(Number),
          correlationId: expect.any(String),
          payload: expect.any(Object),
        }),
      );
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'application/runtime-ready',
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'application/tick',
        occurredAt: 123_456,
        payload: { nowTs: 123_456 },
      }),
    );

    const commandRoutedEvents = events.filter(
      (event): event is Extract<ApplicationEvent, { eventType: 'application/command-routed' }> => {
        return event.eventType === 'application/command-routed';
      },
    );
    const helpRequestedEvents = events.filter(
      (
        event,
      ): event is Extract<ApplicationEvent, { eventType: 'domain/help' }> & {
        readonly payload: { readonly phase: 'requested' };
      } => {
        return event.eventType === 'domain/help' && event.payload.phase === 'requested';
      },
    );
    const helpAdResultEvents = events.filter(
      (
        event,
      ): event is Extract<ApplicationEvent, { eventType: 'domain/help' }> & {
        readonly payload: { readonly phase: 'ad-result' };
      } => {
        return event.eventType === 'domain/help' && event.payload.phase === 'ad-result';
      },
    );

    expect(helpRequestedEvents).toHaveLength(2);
    expect(helpAdResultEvents).toHaveLength(1);
    expect(helpAdResultEvents[0]).toMatchObject({
      correlationId: 'op-ad',
      payload: {
        phase: 'ad-result',
        operationId: 'op-ad',
        helpKind: 'hint',
        outcome: 'reward',
        applied: false,
        durationMs: null,
        outcomeContext: null,
        cooldownApplied: false,
        cooldownDurationMs: 0,
        toastMessage: null,
      },
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'domain/word-success',
        correlationId: 'op-word',
        payload: expect.objectContaining({
          wordId: 'word-1',
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'domain/level-clear',
        correlationId: 'op-transition',
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'domain/persistence',
        payload: {
          commandType: 'RestoreSession',
          operation: 'restore-session',
        },
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'domain/leaderboard-sync',
        payload: {
          commandType: 'SyncLeaderboard',
          operation: 'sync-score',
        },
      }),
    );

    const helpRouteCorrelations = commandRoutedEvents
      .filter((event) => {
        return (
          event.payload.commandType === 'RequestHint' ||
          event.payload.commandType === 'RequestReshuffle'
        );
      })
      .map((event) => event.correlationId)
      .sort();
    const helpEventCorrelations = helpRequestedEvents.map((event) => event.correlationId).sort();
    expect(helpEventCorrelations).toEqual(helpRouteCorrelations);

    const restoreRouteCorrelation = commandRoutedEvents.find((event) => {
      return event.payload.commandType === 'RestoreSession';
    })?.correlationId;
    const restoreDomainCorrelation = events.find((event) => {
      return event.eventType === 'domain/persistence';
    })?.correlationId;
    expect(restoreDomainCorrelation).toBe(restoreRouteCorrelation);

    const syncRouteCorrelation = commandRoutedEvents.find((event) => {
      return event.payload.commandType === 'SyncLeaderboard';
    })?.correlationId;
    const syncDomainCorrelation = events.find((event) => {
      return event.eventType === 'domain/leaderboard-sync';
    })?.correlationId;
    expect(syncDomainCorrelation).toBe(syncRouteCorrelation);

    const ackMap = new Map(commandAcks.map((ack) => [ack.commandType, ack.correlationId]));
    expect(ackMap.get('AcknowledgeAdResult')).toBe('op-ad');
    expect(ackMap.get('AcknowledgeWordSuccessAnimation')).toBe('op-word');
    expect(ackMap.get('AcknowledgeLevelTransitionDone')).toBe('op-transition');
  });

  it('returns a domain error envelope for invalid SubmitPath payload', () => {
    const application = createSmokeApplication();
    const result = application.commands.dispatch({ type: 'SubmitPath', pathCells: [] });

    expect(result.type).toBe('domainError');
    if (result.type === 'domainError') {
      expect(result.error).toMatchObject({
        code: 'submit-path.empty',
        retryable: false,
      });
    }
  });

  it('commits SubmitPath scoring before command-routed event (state-first)', () => {
    const application = createApplicationLayer({
      coreState: createCoreStateModule({
        initialGameState: createScoringFixtureState(),
        wordValidation: createWordValidationModule(new Set(['дом', 'нос', 'сон'])),
        nowProvider: () => 3_000,
      }),
      helpEconomy: createHelpEconomyModule(0),
    });

    let scoreObservedAtRoute = -1;
    application.events.subscribe((event) => {
      if (event.eventType !== 'application/command-routed') {
        return;
      }

      if (event.payload.commandType !== 'SubmitPath') {
        return;
      }

      scoreObservedAtRoute = application.readModel.getCoreState().gameplay.allTimeScore;
    });

    const result = application.commands.dispatch({
      type: 'SubmitPath',
      pathCells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
    });

    expect(result.type).toBe('ok');
    expect(scoreObservedAtRoute).toBe(16);

    const coreState = application.readModel.getCoreState();
    expect(coreState.gameplay).toMatchObject({
      allTimeScore: 16,
      stateVersion: 1,
      progress: {
        foundTargets: 1,
        totalTargets: 3,
      },
      levelStatus: 'active',
    });
    expect(coreState.gameplay.foundTargets).toEqual(['дом']);
  });

  it('processes completion pipeline and auto-next via acknowledge commands', () => {
    const application = createApplicationLayer({
      coreState: createCoreStateModule({
        initialGameState: createScoringFixtureState(),
        wordValidation: createWordValidationModule(new Set(['дом', 'нос', 'сон'])),
        nowProvider: () => 4_000,
      }),
      helpEconomy: createHelpEconomyModule(0),
    });

    const submitPath = (pathCells: ReadonlyArray<{ row: number; col: number }>): string => {
      const result = application.commands.dispatch({
        type: 'SubmitPath',
        pathCells,
      });

      expect(result.type).toBe('ok');
      return result.type === 'ok' ? result.value.correlationId : '';
    };

    submitPath([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);
    submitPath([
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ]);
    const finalTargetCorrelationId = submitPath([
      { row: 1, col: 3 },
      { row: 1, col: 2 },
      { row: 1, col: 1 },
    ]);

    const completedSnapshot = application.readModel.getCoreState();
    expect(completedSnapshot.gameplay).toMatchObject({
      allTimeScore: 48,
      levelStatus: 'completed',
      isInputLocked: true,
      showEphemeralCongrats: false,
      progress: {
        foundTargets: 3,
        totalTargets: 3,
      },
      stateVersion: 3,
    });
    expect(completedSnapshot.gameplay.pendingWordSuccessOperationId).toEqual(expect.any(String));
    expect(finalTargetCorrelationId).toBe(completedSnapshot.gameplay.pendingWordSuccessOperationId);

    const wordSuccessOperationId = completedSnapshot.gameplay.pendingWordSuccessOperationId!;
    const wordSuccessAckResult = application.commands.dispatch({
      type: 'AcknowledgeWordSuccessAnimation',
      wordId: 'сон',
      operationId: wordSuccessOperationId,
    });
    expect(wordSuccessAckResult.type).toBe('ok');

    const reshufflingSnapshot = application.readModel.getCoreState();
    expect(reshufflingSnapshot.gameplay).toMatchObject({
      allTimeScore: 93,
      levelStatus: 'reshuffling',
      isInputLocked: true,
      showEphemeralCongrats: true,
      pendingWordSuccessOperationId: null,
      stateVersion: 4,
    });
    expect(reshufflingSnapshot.gameplay.pendingLevelTransitionOperationId).toEqual(
      expect.any(String),
    );

    const levelTransitionOperationId =
      reshufflingSnapshot.gameplay.pendingLevelTransitionOperationId!;
    const transitionAckResult = application.commands.dispatch({
      type: 'AcknowledgeLevelTransitionDone',
      operationId: levelTransitionOperationId,
    });
    expect(transitionAckResult.type).toBe('ok');

    const nextLevelSnapshot = application.readModel.getCoreState();
    expect(nextLevelSnapshot.gameplay).toMatchObject({
      allTimeScore: 93,
      levelStatus: 'active',
      isInputLocked: false,
      showEphemeralCongrats: false,
      pendingWordSuccessOperationId: null,
      pendingLevelTransitionOperationId: null,
      stateVersion: 5,
    });
    expect(nextLevelSnapshot.gameplay.levelId).not.toBe('level-command-bus');
    expect(nextLevelSnapshot.gameplay.progress).toMatchObject({
      foundTargets: 0,
    });
    expect(nextLevelSnapshot.gameplay.progress.totalTargets).toBeGreaterThanOrEqual(3);
  });

  it('enforces shared help lock and releases it after ad acknowledgement', () => {
    const application = createApplicationLayer({
      coreState: createCoreStateModule({
        initialGameState: createScoringFixtureState(),
        wordValidation: createWordValidationModule(new Set(['дом', 'нос', 'сон'])),
      }),
      helpEconomy: createHelpEconomyModule({
        windowStartTs: 1_000,
        freeActionAvailable: true,
      }),
    });

    const firstHelp = application.commands.dispatch({ type: 'RequestHint' });
    expect(firstHelp.type).toBe('ok');

    const afterFreeHint = application.queries.execute({ type: 'GetHelpWindowState' });
    expect(afterFreeHint.type).toBe('ok');
    if (afterFreeHint.type === 'ok') {
      expect(afterFreeHint.value.freeActionAvailable).toBe(false);
      expect(afterFreeHint.value.isLocked).toBe(false);
      expect(afterFreeHint.value.pendingRequest).toBeNull();
    }

    const adRequiredHelp = application.commands.dispatch({ type: 'RequestReshuffle' });
    expect(adRequiredHelp.type).toBe('ok');
    const pendingOperationId =
      adRequiredHelp.type === 'ok' ? adRequiredHelp.value.correlationId : '';

    const lockedWindow = application.queries.execute({ type: 'GetHelpWindowState' });
    expect(lockedWindow.type).toBe('ok');
    if (lockedWindow.type === 'ok') {
      expect(lockedWindow.value.isLocked).toBe(true);
      expect(lockedWindow.value.pendingRequest).toMatchObject({
        operationId: pendingOperationId,
        kind: 'reshuffle',
        isFreeAction: false,
      });
    }

    const blockedReentrant = application.commands.dispatch({ type: 'RequestHint' });
    expect(blockedReentrant.type).toBe('domainError');
    if (blockedReentrant.type === 'domainError') {
      expect(blockedReentrant.error.code).toBe('help.request.locked');
    }

    const adAck = application.commands.dispatch({
      type: 'AcknowledgeAdResult',
      helpType: 'reshuffle',
      outcome: 'close',
      operationId: pendingOperationId,
    });
    expect(adAck.type).toBe('ok');

    const unlockedWindow = application.queries.execute({ type: 'GetHelpWindowState' });
    expect(unlockedWindow.type).toBe('ok');
    if (unlockedWindow.type === 'ok') {
      expect(unlockedWindow.value.isLocked).toBe(true);
      expect(unlockedWindow.value.pendingRequest).toBeNull();
      expect(unlockedWindow.value.freeActionAvailable).toBe(false);
      expect(unlockedWindow.value.cooldownMsRemaining).toBeGreaterThan(0);
      expect(unlockedWindow.value.cooldownReason).toBe('close');
    }

    const blockedByCooldown = application.commands.dispatch({ type: 'RequestHint' });
    expect(blockedByCooldown.type).toBe('domainError');
    if (blockedByCooldown.type === 'domainError') {
      expect(blockedByCooldown.error.code).toBe('help.request.cooldown');
    }
  });
});
