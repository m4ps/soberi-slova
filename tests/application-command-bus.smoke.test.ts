import { describe, expect, it, vi } from 'vitest';

import {
  createApplicationLayer,
  INTERNAL_ADAPTER_COMMAND_TYPES,
  TECHSPEC_V1_1_COMMAND_TYPES,
  type ApplicationCommand,
  type ApplicationEvent,
} from '../src/application';
import { createCoreStateModule } from '../src/domain/CoreState';
import type { GameStateInput } from '../src/domain/GameState';
import { createHelpEconomyModule } from '../src/domain/HelpEconomy';
import { createWordValidationModule } from '../src/domain/WordValidation';
import {
  createDefaultDictionaryWords,
  createNearCompletionFixtureState,
} from './helpers/game-state-fixtures';

function createSmokeApplication() {
  return createApplicationLayer({
    coreState: createCoreStateModule(),
    helpEconomy: createHelpEconomyModule(0),
  });
}

function createScoringFixtureState(): GameStateInput {
  return createNearCompletionFixtureState({
    levelId: 'level-command-bus',
    source: 'command-bus-test',
    seed: 9,
  });
}

interface CapturedTargetWordAcceptedEvent {
  readonly eventType: 'domain/target-word-accepted';
  readonly payload: {
    readonly commandType: 'SubmitPath';
    readonly targetWord: string;
    readonly scoreDelta: {
      readonly wordScore: number;
      readonly levelClearScore: number;
      readonly totalScore: number;
    };
    readonly progress: {
      readonly foundTargets: number;
      readonly totalTargets: number;
    };
    readonly allTimeScore: number;
    readonly pathCells: ReadonlyArray<{ readonly row: number; readonly col: number }>;
  };
}

describe('application command/query bus smoke', () => {
  it('routes TECHSPEC v1.1 commands through a single command bus', () => {
    const application = createSmokeApplication();
    const events: ApplicationEvent[] = [];
    application.events.subscribe((event) => {
      events.push(event);
    });
    const commandAcks: Array<{ commandType: ApplicationCommand['type']; correlationId: string }> =
      [];

    const commands: ApplicationCommand[] = [
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

    expect(routedCommandTypes).toEqual(expect.arrayContaining([...TECHSPEC_V1_1_COMMAND_TYPES]));
    expect(routedCommandTypes).toEqual(
      expect.not.arrayContaining([...INTERNAL_ADAPTER_COMMAND_TYPES]),
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
    const helpActionAppliedEvents = events.filter(
      (event): event is Extract<ApplicationEvent, { eventType: 'domain/help-action-applied' }> => {
        return event.eventType === 'domain/help-action-applied';
      },
    );
    const helpActionFailedEvents = events.filter(
      (event): event is Extract<ApplicationEvent, { eventType: 'domain/help-action-failed' }> => {
        return event.eventType === 'domain/help-action-failed';
      },
    );
    const hintProgressEvents = events.filter(
      (
        event,
      ): event is Extract<
        ApplicationEvent,
        { eventType: 'domain/hint-path-progress-advanced' }
      > => {
        return event.eventType === 'domain/hint-path-progress-advanced';
      },
    );

    expect(helpRequestedEvents).toHaveLength(2);
    expect(helpAdResultEvents).toHaveLength(1);
    expect(helpActionAppliedEvents).toHaveLength(1);
    expect(helpActionFailedEvents).toHaveLength(1);
    expect(hintProgressEvents).toHaveLength(1);
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
    expect(helpActionAppliedEvents[0]).toMatchObject({
      payload: {
        commandType: 'RequestHint',
        helpKind: 'hint',
        source: 'free',
        effect: {
          kind: 'hint',
        },
      },
    });
    expect(helpActionFailedEvents[0]).toMatchObject({
      correlationId: 'op-ad',
      payload: {
        commandType: 'AcknowledgeAdResult',
        helpKind: 'hint',
        source: 'rewarded-ad',
        reason: 'ad-reward-not-applied',
        outcome: 'reward',
        toastMessage: null,
      },
    });
    expect(hintProgressEvents[0]).toMatchObject({
      payload: {
        commandType: 'RequestHint',
        revealCount: expect.any(Number),
        levelId: expect.any(String),
      },
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'domain/word-submitted',
        payload: expect.objectContaining({
          commandType: 'SubmitPath',
          result: 'invalid',
          isSilent: true,
          pathCells: [{ row: 0, col: 0 }],
        }),
      }),
    );
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
        payload: expect.objectContaining({
          commandType: 'RestoreSession',
          operation: 'restore-session',
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'domain/leaderboard-sync',
        payload: expect.objectContaining({
          commandType: 'SyncLeaderboard',
          operation: 'sync-score',
          requestedScore: expect.any(Number),
        }),
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

  it('treats RuntimeReady and Tick as internal adapter commands', () => {
    const application = createSmokeApplication();
    const events: ApplicationEvent[] = [];
    application.events.subscribe((event) => {
      events.push(event);
    });

    const runtimeReadyResult = application.commands.dispatch({ type: 'RuntimeReady' });
    const tickResult = application.commands.dispatch({ type: 'Tick', nowTs: 123_456 });

    expect(runtimeReadyResult.type).toBe('ok');
    expect(tickResult.type).toBe('ok');
    if (runtimeReadyResult.type === 'ok' && tickResult.type === 'ok') {
      expect([runtimeReadyResult.value.commandType, tickResult.value.commandType]).toEqual([
        ...INTERNAL_ADAPTER_COMMAND_TYPES,
      ]);
    }

    const coreStateResult = application.queries.execute({ type: 'GetCoreState' });
    expect(coreStateResult.type).toBe('ok');
    if (coreStateResult.type === 'ok') {
      expect(coreStateResult.value.runtimeMode).toBe('ready');
    }

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
    expect(events.filter((event) => event.eventType === 'application/command-routed')).toHaveLength(
      0,
    );
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

  it('restores persisted score, level and help timer from RestoreSession payload', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(10_000);

    try {
      const restoredState: GameStateInput = {
        ...createScoringFixtureState(),
        stateVersion: 7,
        updatedAt: 9_000,
        allTimeScore: 123,
        currentLevelSession: {
          ...createScoringFixtureState().currentLevelSession,
          levelId: 'level-restored',
          foundTargets: [...createScoringFixtureState().currentLevelSession.foundTargets, 'дом'],
          foundBonuses: ['том'],
          status: 'active',
          meta: {
            ...createScoringFixtureState().currentLevelSession.meta,
            hintTargetWord: 'нос',
            hintRevealCount: 2,
          },
        },
        helpWindow: {
          windowStartTs: 9_500,
          freeActionAvailable: false,
          pendingHelpRequest: null,
        },
      };
      const application = createApplicationLayer({
        coreState: createCoreStateModule({
          initialGameState: createScoringFixtureState(),
          wordValidation: createWordValidationModule(new Set(createDefaultDictionaryWords())),
          nowProvider: () => 10_000,
        }),
        helpEconomy: createHelpEconomyModule({
          windowStartTs: 0,
          freeActionAvailable: true,
          nowProvider: () => 10_000,
        }),
      });

      const restoreResult = application.commands.dispatch({
        type: 'RestoreSession',
        payload: {
          localSnapshot: {
            schemaVersion: 1,
            capturedAt: 9_000,
            gameStateSerialized: JSON.stringify(restoredState),
            helpWindow: {
              windowStartTs: 9_500,
              freeActionAvailable: false,
            },
          },
          cloudSnapshot: null,
          cloudAllTimeScore: null,
        },
      });

      expect(restoreResult.type).toBe('ok');
      const restoredCoreState = application.readModel.getCoreState();
      expect(restoredCoreState.gameplay).toMatchObject({
        allTimeScore: 123,
        levelId: 'level-restored',
      });
      expect(restoredCoreState.gameplay.foundTargets).toEqual([
        ...createScoringFixtureState().currentLevelSession.foundTargets,
        'дом',
      ]);
      expect(restoredCoreState.gameplay.foundBonuses).toEqual(['том']);
      expect(restoredCoreState.gameState).toMatchObject({
        currentDisplayedTargetId: 'нос',
        currentHintPathProgress: 2,
      });
      expect(restoredCoreState.gameState.currentLevelSession.readabilityScore).toBe(3.7);

      const restoredHelpWindow = application.readModel.getHelpWindowState();
      expect(restoredHelpWindow.windowStartTs).toBe(9_500);
      expect(restoredHelpWindow.freeActionAvailable).toBe(false);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('keeps guided restore state when the persistence envelope loses only helpWindow metadata', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(12_000);

    try {
      const restoredState: GameStateInput = {
        ...createScoringFixtureState(),
        stateVersion: 9,
        updatedAt: 11_000,
        allTimeScore: 150,
        currentDisplayedTargetId: 'нос',
        currentHintPathProgress: 2,
        currentLevelSession: {
          ...createScoringFixtureState().currentLevelSession,
          levelId: 'level-guided-restore',
          foundTargets: [...createScoringFixtureState().currentLevelSession.foundTargets, 'дом'],
          status: 'active',
        },
        helpWindow: {
          windowStartTs: 11_500,
          freeActionAvailable: false,
          pendingHelpRequest: null,
        },
      };
      const application = createApplicationLayer({
        coreState: createCoreStateModule({
          initialGameState: createScoringFixtureState(),
          wordValidation: createWordValidationModule(new Set(createDefaultDictionaryWords())),
          nowProvider: () => 12_000,
        }),
        helpEconomy: createHelpEconomyModule({
          windowStartTs: 0,
          freeActionAvailable: true,
          nowProvider: () => 12_000,
        }),
      });

      const restoreResult = application.commands.dispatch({
        type: 'RestoreSession',
        payload: {
          localSnapshot: {
            schemaVersion: 1,
            capturedAt: 11_000,
            gameStateSerialized: JSON.stringify(restoredState),
            helpWindow: null,
          },
          cloudSnapshot: null,
          cloudAllTimeScore: null,
        },
      });

      expect(restoreResult.type).toBe('ok');
      const restoredCoreState = application.readModel.getCoreState();
      expect(restoredCoreState.gameplay).toMatchObject({
        allTimeScore: 150,
        levelId: 'level-guided-restore',
      });
      expect(restoredCoreState.gameState).toMatchObject({
        currentDisplayedTargetId: 'нос',
        currentHintPathProgress: 2,
      });

      const restoredHelpWindow = application.readModel.getHelpWindowState();
      expect(restoredHelpWindow.windowStartTs).toBe(11_500);
      expect(restoredHelpWindow.freeActionAvailable).toBe(false);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('commits SubmitPath scoring before command-routed event (state-first)', () => {
    const application = createApplicationLayer({
      coreState: createCoreStateModule({
        initialGameState: createScoringFixtureState(),
        wordValidation: createWordValidationModule(new Set(createDefaultDictionaryWords())),
        nowProvider: () => 3_000,
      }),
      helpEconomy: createHelpEconomyModule(0),
    });

    const events: ApplicationEvent[] = [];
    let scoreObservedAtRoute = -1;
    application.events.subscribe((event) => {
      events.push(event);

      if (event.eventType !== 'application/command-routed') {
        return;
      }

      if (event.payload.commandType === 'SubmitPath') {
        scoreObservedAtRoute = application.readModel.getCoreState().gameplay.allTimeScore;
      }
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
    expect(scoreObservedAtRoute).toBe(7);
    if (result.type === 'ok') {
      expect(result.value.correlationId).toEqual(expect.any(String));
    }
    const submitEvent = events.find((event) => {
      return (event as { eventType: string }).eventType === 'domain/target-word-accepted';
    }) as CapturedTargetWordAcceptedEvent | undefined;

    expect(submitEvent).toBeDefined();
    if (!submitEvent) {
      throw new Error('Expected domain/target-word-accepted event.');
    }

    expect(submitEvent.payload).toMatchObject({
      commandType: 'SubmitPath',
      targetWord: 'дом',
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
    });
    expect(submitEvent.payload.pathCells).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);

    const coreState = application.readModel.getCoreState();
    expect(coreState.gameplay).toMatchObject({
      allTimeScore: 7,
      stateVersion: 1,
      isInputLocked: true,
      progress: {
        foundTargets: 8,
        totalTargets: 10,
      },
      levelStatus: 'active',
    });
    if (result.type === 'ok') {
      expect(coreState.gameplay.pendingWordSuccessOperationId).toBe(result.value.correlationId);
    }
    expect(coreState.gameplay.foundTargets).toEqual([
      ...createScoringFixtureState().currentLevelSession.foundTargets,
      'дом',
    ]);
  });

  it('accepts out-of-focus target words without emitting a premature displayed-target switch', () => {
    const application = createApplicationLayer({
      coreState: createCoreStateModule({
        initialGameState: {
          ...createScoringFixtureState(),
          currentDisplayedTargetId: 'дом',
          currentHintPathProgress: 2,
        },
        wordValidation: createWordValidationModule(new Set(createDefaultDictionaryWords())),
        nowProvider: () => 3_500,
      }),
      helpEconomy: createHelpEconomyModule(0),
    });

    const events: ApplicationEvent[] = [];
    application.events.subscribe((event) => {
      events.push(event);
    });

    const result = application.commands.dispatch({
      type: 'SubmitPath',
      pathCells: [
        { row: 1, col: 3 },
        { row: 1, col: 2 },
        { row: 1, col: 1 },
      ],
    });

    expect(result.type).toBe('ok');
    const correlationId = result.type === 'ok' ? result.value.correlationId : '';

    const coreState = application.readModel.getCoreState();
    expect(coreState.gameplay).toMatchObject({
      allTimeScore: 7,
      stateVersion: 1,
      isInputLocked: true,
      levelStatus: 'active',
      progress: {
        foundTargets: 8,
        totalTargets: 10,
      },
    });
    expect(coreState.gameState).toMatchObject({
      currentDisplayedTargetId: 'дом',
      currentHintPathProgress: 2,
    });
    expect(coreState.gameplay.pendingWordSuccessOperationId).toBe(correlationId);
    expect(coreState.gameplay.foundTargets).toEqual([
      ...createScoringFixtureState().currentLevelSession.foundTargets,
      'сон',
    ]);

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'domain/target-word-accepted',
        correlationId,
        payload: expect.objectContaining({
          commandType: 'SubmitPath',
          targetWord: 'сон',
          displayedTargetId: 'дом',
          progress: {
            foundTargets: 8,
            totalTargets: 10,
          },
          scoreDelta: {
            wordScore: 7,
            levelClearScore: 0,
            totalScore: 7,
          },
          allTimeScore: 7,
        }),
      }),
    );

    expect(
      events.filter((event) => {
        return (
          event.eventType === 'domain/displayed-target-changed' &&
          event.correlationId === correlationId
        );
      }),
    ).toEqual([]);
  });

  it('processes completion pipeline and auto-next via acknowledge commands', () => {
    const application = createApplicationLayer({
      coreState: createCoreStateModule({
        initialGameState: createScoringFixtureState(),
        wordValidation: createWordValidationModule(new Set(createDefaultDictionaryWords())),
        nowProvider: () => 4_000,
      }),
      helpEconomy: createHelpEconomyModule(0),
    });
    const events: ApplicationEvent[] = [];
    application.events.subscribe((event) => {
      events.push(event);
    });

    const submitPath = (pathCells: ReadonlyArray<{ row: number; col: number }>): string => {
      const result = application.commands.dispatch({
        type: 'SubmitPath',
        pathCells,
      });

      expect(result.type).toBe('ok');
      return result.type === 'ok' ? result.value.correlationId : '';
    };

    const acknowledgeWordSuccess = (operationId: string, wordId: string): void => {
      const result = application.commands.dispatch({
        type: 'AcknowledgeWordSuccessAnimation',
        wordId,
        operationId,
      });

      expect(result.type).toBe('ok');
    };

    const firstTargetCorrelationId = submitPath([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);
    acknowledgeWordSuccess(firstTargetCorrelationId, 'дом');

    const secondTargetCorrelationId = submitPath([
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ]);
    acknowledgeWordSuccess(secondTargetCorrelationId, 'нос');

    const finalTargetCorrelationId = submitPath([
      { row: 1, col: 3 },
      { row: 1, col: 2 },
      { row: 1, col: 1 },
    ]);

    const completedSnapshot = application.readModel.getCoreState();
    expect(completedSnapshot.gameplay).toMatchObject({
      allTimeScore: 21,
      levelStatus: 'completed',
      isInputLocked: true,
      showEphemeralCongrats: false,
      progress: {
        foundTargets: 10,
        totalTargets: 10,
      },
      stateVersion: 5,
    });
    expect(completedSnapshot.gameplay.pendingWordSuccessOperationId).toEqual(expect.any(String));
    expect(finalTargetCorrelationId).toBe(completedSnapshot.gameplay.pendingWordSuccessOperationId);
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'domain/level-completed',
        correlationId: finalTargetCorrelationId,
        payload: expect.objectContaining({
          commandType: 'SubmitPath',
          levelId: 'level-command-bus',
          completedWord: 'сон',
          wordSuccessOperationId: finalTargetCorrelationId,
          displayedTargetId: null,
          progress: {
            foundTargets: 10,
            totalTargets: 10,
          },
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'domain/displayed-target-changed',
        correlationId: finalTargetCorrelationId,
        payload: expect.objectContaining({
          commandType: 'SubmitPath',
          reason: 'target-accepted',
          previousLevelId: 'level-command-bus',
          nextLevelId: 'level-command-bus',
          nextTargetWordId: null,
        }),
      }),
    );

    const wordSuccessOperationId = completedSnapshot.gameplay.pendingWordSuccessOperationId!;
    acknowledgeWordSuccess(wordSuccessOperationId, 'сон');

    const reshufflingSnapshot = application.readModel.getCoreState();
    expect(reshufflingSnapshot.gameplay).toMatchObject({
      allTimeScore: 41,
      levelStatus: 'reshuffling',
      isInputLocked: true,
      showEphemeralCongrats: true,
      pendingWordSuccessOperationId: null,
      stateVersion: 6,
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
      allTimeScore: 41,
      levelStatus: 'active',
      isInputLocked: false,
      showEphemeralCongrats: false,
      pendingWordSuccessOperationId: null,
      pendingLevelTransitionOperationId: null,
      stateVersion: 7,
    });
    expect(nextLevelSnapshot.gameplay.levelId).not.toBe('level-command-bus');
    expect(nextLevelSnapshot.gameplay.progress).toMatchObject({
      foundTargets: 0,
    });
    expect(nextLevelSnapshot.gameplay.progress.totalTargets).toBeGreaterThanOrEqual(10);
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'domain/displayed-target-changed',
        correlationId: levelTransitionOperationId,
        payload: expect.objectContaining({
          commandType: 'AcknowledgeLevelTransitionDone',
          reason: 'level-transition',
          previousLevelId: 'level-command-bus',
          nextLevelId: nextLevelSnapshot.gameplay.levelId,
        }),
      }),
    );
  });

  it('enforces shared help lock and releases it after ad acknowledgement', () => {
    const application = createApplicationLayer({
      coreState: createCoreStateModule({
        initialGameState: createScoringFixtureState(),
        wordValidation: createWordValidationModule(new Set(createDefaultDictionaryWords())),
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
