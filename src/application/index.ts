import type {
  ApplicationCommand,
  ApplicationError,
  ApplicationEvent,
  ApplicationEventBus,
  ApplicationEventListener,
  ApplicationLayer,
  ApplicationQuery,
  ApplicationQueryBus,
  ApplicationQueryPayload,
  ApplicationReadModel,
  ApplicationResult,
  CommandAck,
  DomainModules,
  PersistedHelpWindowSnapshot,
  PersistedSessionSnapshot,
  RestoreSessionPayload,
  RoutedCommandType,
  GridCellRef,
} from './contracts';
import type { CoreStateHelpEffect, CoreStateSnapshot } from '../domain/CoreState';
import { toErrorMessage } from '../shared/errors';
import { parseNonNegativeSafeInteger } from '../shared/runtime-guards';

function assertNever(value: never): never {
  throw new Error(`Unsupported command: ${JSON.stringify(value)}`);
}

function createError(
  code: string,
  message: string,
  retryable: boolean,
  context: Readonly<Record<string, unknown>> = {},
): ApplicationError {
  return { code, message, retryable, context };
}

function ok<TValue>(value: TValue): ApplicationResult<TValue> {
  return { type: 'ok', value };
}

function domainError<TValue>(
  code: string,
  message: string,
  context: Readonly<Record<string, unknown>> = {},
): ApplicationResult<TValue> {
  return {
    type: 'domainError',
    error: createError(code, message, false, context),
  };
}

function infraError<TValue>(
  code: string,
  message: string,
  context: Readonly<Record<string, unknown>> = {},
): ApplicationResult<TValue> {
  return {
    type: 'infraError',
    error: createError(code, message, true, context),
  };
}

const EVENT_VERSIONS: Readonly<Record<ApplicationEvent['eventType'], number>> = {
  'application/runtime-ready': 1,
  'application/tick': 1,
  'application/command-routed': 1,
  'domain/word-submitted': 1,
  'domain/target-word-accepted': 1,
  'domain/bonus-word-accepted': 1,
  'domain/displayed-target-changed': 1,
  'domain/hint-path-progress-advanced': 1,
  'domain/level-completed': 1,
  'domain/help-action-applied': 1,
  'domain/help-action-failed': 1,
  'domain/word-success': 1,
  'domain/level-clear': 1,
  'domain/help': 1,
  'domain/persistence': 1,
  'domain/state-persisted': 1,
  'domain/leaderboard-sync': 1,
};
const HELP_NO_FILL_TOAST_MESSAGE = 'Реклама сейчас недоступна';
const HELP_GENERIC_AD_FAILURE_TOAST_MESSAGE = 'Не удалось показать рекламу';

function normalizeDurationMs(durationMs: number | undefined): number | null {
  if (durationMs === undefined) {
    return null;
  }

  if (!Number.isFinite(durationMs)) {
    return null;
  }

  return Math.max(0, Math.trunc(durationMs));
}

function normalizeOutcomeContext(outcomeContext: string | null | undefined): string | null {
  if (typeof outcomeContext !== 'string') {
    return null;
  }

  const normalized = outcomeContext.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveHelpAdToastMessage(
  outcome: 'reward' | 'close' | 'error' | 'no-fill',
): string | null {
  if (outcome === 'reward') {
    return null;
  }

  if (outcome === 'no-fill') {
    return HELP_NO_FILL_TOAST_MESSAGE;
  }

  return HELP_GENERIC_AD_FAILURE_TOAST_MESSAGE;
}

function normalizePersistedHelpWindow(
  snapshot: PersistedSessionSnapshot | null | undefined,
): PersistedHelpWindowSnapshot | null {
  if (!snapshot) {
    return null;
  }

  const helpWindow = snapshot.helpWindow;
  if (!helpWindow) {
    return null;
  }
  const windowStartTs = parseNonNegativeSafeInteger(helpWindow.windowStartTs);
  if (windowStartTs === null) {
    return null;
  }

  return {
    windowStartTs,
    freeActionAvailable: helpWindow.freeActionAvailable === true,
  };
}

function resolveSnapshotCapturedAt(snapshot: PersistedSessionSnapshot | null | undefined): number {
  if (!snapshot) {
    return -1;
  }

  const capturedAt = parseNonNegativeSafeInteger(snapshot.capturedAt);
  return capturedAt === null ? -1 : capturedAt;
}

function resolveRestoreHelpWindow(
  payload: RestoreSessionPayload | undefined,
  source: 'local' | 'cloud' | 'none',
): PersistedHelpWindowSnapshot | null {
  if (!payload) {
    return null;
  }

  if (source === 'local') {
    return (
      normalizePersistedHelpWindow(payload.localSnapshot) ??
      normalizePersistedHelpWindow(payload.cloudSnapshot)
    );
  }

  if (source === 'cloud') {
    return (
      normalizePersistedHelpWindow(payload.cloudSnapshot) ??
      normalizePersistedHelpWindow(payload.localSnapshot)
    );
  }

  const localHelpWindow = normalizePersistedHelpWindow(payload.localSnapshot);
  const cloudHelpWindow = normalizePersistedHelpWindow(payload.cloudSnapshot);

  if (localHelpWindow && !cloudHelpWindow) {
    return localHelpWindow;
  }

  if (cloudHelpWindow && !localHelpWindow) {
    return cloudHelpWindow;
  }

  if (localHelpWindow && cloudHelpWindow) {
    return resolveSnapshotCapturedAt(payload.localSnapshot) >=
      resolveSnapshotCapturedAt(payload.cloudSnapshot)
      ? localHelpWindow
      : cloudHelpWindow;
  }

  return null;
}

function clonePathCells(pathCells: readonly GridCellRef[]): readonly GridCellRef[] {
  return pathCells.map((cell) => ({ ...cell }));
}

function cloneHelpEffect(effect: CoreStateHelpEffect): CoreStateHelpEffect {
  if (effect.kind === 'hint') {
    return {
      ...effect,
      revealedPathCells: clonePathCells(effect.revealedPathCells),
    };
  }

  return {
    ...effect,
  };
}

export function createApplicationLayer(modules: DomainModules): ApplicationLayer {
  type EventType = ApplicationEvent['eventType'];
  type EventByType<TType extends EventType> = Extract<ApplicationEvent, { eventType: TType }>;
  type DisplayedTargetChangedPayload = Extract<
    ApplicationEvent,
    { eventType: 'domain/displayed-target-changed' }
  >['payload'];
  type HelpActionAppliedPayload = Extract<
    ApplicationEvent,
    { eventType: 'domain/help-action-applied' }
  >['payload'];
  type HelpActionFailedPayload = Extract<
    ApplicationEvent,
    { eventType: 'domain/help-action-failed' }
  >['payload'];

  const eventListeners = new Set<ApplicationEventListener>();
  let eventSequence = 0;
  let correlationSequence = 0;

  const publish = (event: ApplicationEvent): void => {
    eventListeners.forEach((listener) => {
      listener(event);
    });
  };

  const eventBus: ApplicationEventBus = {
    publish,
    subscribe: (listener) => {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
  };

  const createCorrelationId = (commandType: ApplicationCommand['type']): string => {
    correlationSequence += 1;
    return `${commandType}-${Date.now()}-${correlationSequence}`;
  };

  const resolveCorrelationId = (
    commandType: ApplicationCommand['type'],
    correlationId: string | null | undefined,
  ): string => {
    if (typeof correlationId === 'string') {
      const normalizedCorrelationId = correlationId.trim();
      if (normalizedCorrelationId.length > 0) {
        return normalizedCorrelationId;
      }
    }

    return createCorrelationId(commandType);
  };

  const createEvent = <TType extends EventType>(
    eventType: TType,
    correlationId: string,
    payload: EventByType<TType>['payload'],
    occurredAt: number = Date.now(),
  ): EventByType<TType> => {
    eventSequence += 1;
    return {
      eventId: `evt-${occurredAt}-${eventSequence}`,
      eventType,
      eventVersion: EVENT_VERSIONS[eventType],
      occurredAt,
      correlationId,
      payload,
    } as EventByType<TType>;
  };

  const publishDisplayedTargetChanged = (
    commandType: DisplayedTargetChangedPayload['commandType'],
    reason: DisplayedTargetChangedPayload['reason'],
    correlationId: string,
    previousSnapshot: CoreStateSnapshot,
    nextSnapshot: CoreStateSnapshot,
  ): void => {
    const previousLevelId = previousSnapshot.gameplay.levelId;
    const nextLevelId = nextSnapshot.gameplay.levelId;
    const previousTargetWordId = previousSnapshot.gameState.currentDisplayedTargetId;
    const nextTargetWordId = nextSnapshot.gameState.currentDisplayedTargetId;

    if (previousLevelId === nextLevelId && previousTargetWordId === nextTargetWordId) {
      return;
    }

    publish(
      createEvent('domain/displayed-target-changed', correlationId, {
        commandType,
        reason,
        previousLevelId,
        nextLevelId,
        previousTargetWordId,
        nextTargetWordId,
        previousHintPathProgress: previousSnapshot.gameState.currentHintPathProgress,
        nextHintPathProgress: nextSnapshot.gameState.currentHintPathProgress,
        stateVersion: nextSnapshot.gameplay.stateVersion,
        progress: {
          foundTargets: nextSnapshot.gameplay.progress.foundTargets,
          totalTargets: nextSnapshot.gameplay.progress.totalTargets,
        },
      }),
    );
  };

  const acknowledge = (
    commandType: ApplicationCommand['type'],
    correlationId: string,
  ): ApplicationResult<CommandAck> =>
    ok({
      commandType,
      handledAt: Date.now(),
      correlationId,
    });

  const publishCommandRouted = (commandType: RoutedCommandType, correlationId: string): void => {
    publish(
      createEvent('application/command-routed', correlationId, {
        commandType,
      }),
    );
  };

  const routeCommand = (
    commandType: RoutedCommandType,
    correlationId: string | null = null,
    emitDomainEvents?: (resolvedCorrelationId: string) => void,
  ): ApplicationResult<CommandAck> => {
    const resolvedCorrelationId = resolveCorrelationId(commandType, correlationId);
    publishCommandRouted(commandType, resolvedCorrelationId);
    emitDomainEvents?.(resolvedCorrelationId);
    return acknowledge(commandType, resolvedCorrelationId);
  };

  const routeHelpCommand = (
    commandType: 'RequestHint' | 'RequestReshuffle',
    helpKind: 'hint' | 'reshuffle',
  ): ApplicationResult<CommandAck> => {
    const previousCoreState = modules.coreState.getSnapshot();
    const requestedAt = Date.now();
    const decision = modules.helpEconomy.requestHelp(helpKind, requestedAt);

    if (decision.type === 'locked') {
      return domainError(
        'help.request.locked',
        'Help request is ignored while another help operation is pending.',
        {
          commandType,
          helpKind,
          pendingOperationId: decision.pendingOperationId,
        },
      );
    }

    if (decision.type === 'cooldown') {
      return domainError(
        'help.request.cooldown',
        'Help request is temporarily blocked during ad cooldown.',
        {
          commandType,
          helpKind,
          cooldownUntilTs: decision.cooldownUntilTs,
          cooldownMsRemaining: decision.cooldownMsRemaining,
          cooldownReason: decision.cooldownReason,
        },
      );
    }

    let applied = false;
    const requiresAd = decision.type === 'await-ad';
    let helpApplyResult: ReturnType<DomainModules['coreState']['applyHelp']> | null = null;

    if (decision.type === 'apply-now') {
      helpApplyResult = modules.coreState.applyHelp(helpKind, decision.operationId, requestedAt);
      applied = helpApplyResult.applied;
      modules.helpEconomy.finalizePendingRequest(
        decision.operationId,
        helpApplyResult.applied,
        requestedAt,
      );
    }

    const nextCoreState = modules.coreState.getSnapshot();

    return routeCommand(commandType, decision.operationId, (correlationId) => {
      publish(
        createEvent('domain/help', correlationId, {
          phase: 'requested',
          commandType,
          operationId: decision.operationId,
          helpKind: decision.kind,
          isFreeAction: decision.isFreeAction,
          requiresAd,
          applied,
        }),
      );

      if (!helpApplyResult) {
        return;
      }

      const helpSource: HelpActionAppliedPayload['source'] = decision.isFreeAction
        ? 'free'
        : 'rewarded-ad';

      if (helpApplyResult.applied && helpApplyResult.effect) {
        const effect = cloneHelpEffect(helpApplyResult.effect);

        publish(
          createEvent('domain/help-action-applied', correlationId, {
            commandType,
            operationId: decision.operationId,
            helpKind: helpApplyResult.kind,
            source: helpSource,
            levelId: helpApplyResult.levelId,
            stateVersion: helpApplyResult.stateVersion,
            allTimeScore: helpApplyResult.allTimeScore,
            effect,
          }),
        );

        if (effect.kind === 'hint') {
          publish(
            createEvent('domain/hint-path-progress-advanced', correlationId, {
              commandType: 'RequestHint',
              operationId: decision.operationId,
              targetWord: effect.targetWord,
              revealCount: effect.revealCount,
              revealedLetters: effect.revealedLetters,
              revealedPathCells: clonePathCells(effect.revealedPathCells),
              levelId: helpApplyResult.levelId,
              stateVersion: helpApplyResult.stateVersion,
            }),
          );
        }

        publishDisplayedTargetChanged(
          commandType,
          helpKind === 'hint' ? 'hint-applied' : 'reshuffle-applied',
          correlationId,
          previousCoreState,
          nextCoreState,
        );
        return;
      }

      publish(
        createEvent('domain/help-action-failed', correlationId, {
          commandType,
          operationId: decision.operationId,
          helpKind,
          source: helpSource,
          reason: helpApplyResult.reason,
          levelId: helpApplyResult.levelId,
          stateVersion: helpApplyResult.stateVersion,
          allTimeScore: helpApplyResult.allTimeScore,
          outcome: null,
          durationMs: null,
          outcomeContext: null,
          cooldownApplied: false,
          cooldownDurationMs: 0,
          toastMessage: null,
        }),
      );
    });
  };

  const commandBus = {
    dispatch: (command: ApplicationCommand): ApplicationResult<CommandAck> => {
      try {
        switch (command.type) {
          case 'RuntimeReady': {
            modules.coreState.setRuntimeMode('ready');
            const correlationId = createCorrelationId(command.type);
            publish(createEvent('application/runtime-ready', correlationId, {}));
            return acknowledge(command.type, correlationId);
          }
          case 'Tick': {
            const correlationId = createCorrelationId(command.type);
            publish(
              createEvent(
                'application/tick',
                correlationId,
                {
                  nowTs: command.nowTs,
                },
                command.nowTs,
              ),
            );
            return acknowledge(command.type, correlationId);
          }
          case 'SubmitPath': {
            if (command.pathCells.length === 0) {
              return domainError(
                'submit-path.empty',
                'SubmitPath requires at least one grid cell.',
                { pathCells: command.pathCells },
              );
            }

            const previousCoreState = modules.coreState.getSnapshot();
            const submitResult = modules.coreState.submitPath(command.pathCells);
            const nextCoreState = modules.coreState.getSnapshot();
            return routeCommand(
              command.type,
              submitResult.wordSuccessOperationId,
              (correlationId) => {
                publish(
                  createEvent('domain/word-submitted', correlationId, {
                    commandType: command.type,
                    result: submitResult.result,
                    normalizedWord: submitResult.normalizedWord,
                    isSilent: submitResult.isSilent,
                    levelClearAwarded: submitResult.levelClearAwarded,
                    wordSuccessOperationId: submitResult.wordSuccessOperationId,
                    scoreDelta: {
                      wordScore: submitResult.scoreDelta.wordScore,
                      levelClearScore: submitResult.scoreDelta.levelClearScore,
                      totalScore: submitResult.scoreDelta.totalScore,
                    },
                    progress: {
                      foundTargets: submitResult.progress.foundTargets,
                      totalTargets: submitResult.progress.totalTargets,
                    },
                    levelStatus: submitResult.levelStatus,
                    allTimeScore: submitResult.allTimeScore,
                    pathCells: clonePathCells(command.pathCells),
                  }),
                );

                if (
                  submitResult.result === 'target' &&
                  !submitResult.isSilent &&
                  submitResult.normalizedWord
                ) {
                  publish(
                    createEvent('domain/target-word-accepted', correlationId, {
                      commandType: command.type,
                      targetWord: submitResult.normalizedWord,
                      pathCells: clonePathCells(command.pathCells),
                      wordSuccessOperationId: submitResult.wordSuccessOperationId,
                      levelCompleted: submitResult.levelStatus === 'completed',
                      levelId: nextCoreState.gameplay.levelId,
                      stateVersion: submitResult.stateVersion,
                      displayedTargetId: nextCoreState.gameState.currentDisplayedTargetId,
                      scoreDelta: {
                        wordScore: submitResult.scoreDelta.wordScore,
                        levelClearScore: submitResult.scoreDelta.levelClearScore,
                        totalScore: submitResult.scoreDelta.totalScore,
                      },
                      progress: {
                        foundTargets: submitResult.progress.foundTargets,
                        totalTargets: submitResult.progress.totalTargets,
                      },
                      allTimeScore: submitResult.allTimeScore,
                    }),
                  );

                  if (
                    submitResult.levelStatus === 'completed' &&
                    submitResult.wordSuccessOperationId
                  ) {
                    publish(
                      createEvent('domain/level-completed', correlationId, {
                        commandType: command.type,
                        levelId: nextCoreState.gameplay.levelId,
                        completedWord: submitResult.normalizedWord,
                        wordSuccessOperationId: submitResult.wordSuccessOperationId,
                        stateVersion: submitResult.stateVersion,
                        displayedTargetId: nextCoreState.gameState.currentDisplayedTargetId,
                        scoreDelta: {
                          wordScore: submitResult.scoreDelta.wordScore,
                          levelClearScore: submitResult.scoreDelta.levelClearScore,
                          totalScore: submitResult.scoreDelta.totalScore,
                        },
                        progress: {
                          foundTargets: submitResult.progress.foundTargets,
                          totalTargets: submitResult.progress.totalTargets,
                        },
                        allTimeScore: submitResult.allTimeScore,
                      }),
                    );
                  }

                  publishDisplayedTargetChanged(
                    command.type,
                    'target-accepted',
                    correlationId,
                    previousCoreState,
                    nextCoreState,
                  );
                  return;
                }

                if (
                  submitResult.result === 'bonus' &&
                  !submitResult.isSilent &&
                  submitResult.normalizedWord
                ) {
                  publish(
                    createEvent('domain/bonus-word-accepted', correlationId, {
                      commandType: command.type,
                      bonusWord: submitResult.normalizedWord,
                      pathCells: clonePathCells(command.pathCells),
                      levelId: nextCoreState.gameplay.levelId,
                      stateVersion: submitResult.stateVersion,
                      displayedTargetId: nextCoreState.gameState.currentDisplayedTargetId,
                      scoreDelta: {
                        wordScore: submitResult.scoreDelta.wordScore,
                        levelClearScore: submitResult.scoreDelta.levelClearScore,
                        totalScore: submitResult.scoreDelta.totalScore,
                      },
                      progress: {
                        foundTargets: submitResult.progress.foundTargets,
                        totalTargets: submitResult.progress.totalTargets,
                      },
                      allTimeScore: submitResult.allTimeScore,
                    }),
                  );
                }
              },
            );
          }
          case 'RequestHint': {
            return routeHelpCommand(command.type, 'hint');
          }
          case 'RequestReshuffle': {
            return routeHelpCommand(command.type, 'reshuffle');
          }
          case 'AcknowledgeAdResult': {
            const previousCoreState = modules.coreState.getSnapshot();
            const acknowledgedAt = Date.now();
            const helpWindowState = modules.helpEconomy.getWindowState(acknowledgedAt);
            const pendingRequest = helpWindowState.pendingRequest;
            const isMatchingPendingRequest =
              pendingRequest?.operationId === command.operationId &&
              pendingRequest.kind === command.helpType;
            const shouldApplyHelp = isMatchingPendingRequest && command.outcome === 'reward';
            const helpApplyResult: ReturnType<DomainModules['coreState']['applyHelp']> | null =
              shouldApplyHelp
                ? modules.coreState.applyHelp(command.helpType, command.operationId, acknowledgedAt)
                : null;
            const applied = helpApplyResult?.applied ?? false;
            const durationMs = normalizeDurationMs(command.durationMs);
            const outcomeContext = normalizeOutcomeContext(command.outcomeContext);
            const finalizeResult = modules.helpEconomy.finalizePendingRequest(
              command.operationId,
              applied,
              acknowledgedAt,
              command.outcome,
            );
            const toastMessage =
              finalizeResult.finalized && !applied
                ? resolveHelpAdToastMessage(command.outcome)
                : null;
            const nextCoreState = modules.coreState.getSnapshot();

            return routeCommand(command.type, command.operationId, (correlationId) => {
              publish(
                createEvent('domain/help', correlationId, {
                  phase: 'ad-result',
                  commandType: command.type,
                  operationId: command.operationId,
                  helpKind: command.helpType,
                  outcome: command.outcome,
                  applied,
                  durationMs,
                  outcomeContext,
                  cooldownApplied: finalizeResult.cooldownApplied,
                  cooldownDurationMs: finalizeResult.cooldownDurationMs,
                  toastMessage,
                }),
              );

              if (applied && helpApplyResult?.effect) {
                const effect = cloneHelpEffect(helpApplyResult.effect);
                publish(
                  createEvent('domain/help-action-applied', correlationId, {
                    commandType: command.type,
                    operationId: command.operationId,
                    helpKind: command.helpType,
                    source: 'rewarded-ad',
                    levelId: helpApplyResult.levelId,
                    stateVersion: helpApplyResult.stateVersion,
                    allTimeScore: helpApplyResult.allTimeScore,
                    effect,
                  }),
                );

                if (effect.kind === 'hint') {
                  publish(
                    createEvent('domain/hint-path-progress-advanced', correlationId, {
                      commandType: command.type,
                      operationId: command.operationId,
                      targetWord: effect.targetWord,
                      revealCount: effect.revealCount,
                      revealedLetters: effect.revealedLetters,
                      revealedPathCells: clonePathCells(effect.revealedPathCells),
                      levelId: helpApplyResult.levelId,
                      stateVersion: helpApplyResult.stateVersion,
                    }),
                  );
                }

                publishDisplayedTargetChanged(
                  command.type,
                  command.helpType === 'hint' ? 'hint-applied' : 'reshuffle-applied',
                  correlationId,
                  previousCoreState,
                  nextCoreState,
                );
                return;
              }

              const reason: HelpActionFailedPayload['reason'] =
                command.outcome === 'reward'
                  ? (helpApplyResult?.reason ?? 'ad-reward-not-applied')
                  : command.outcome === 'close'
                    ? 'ad-close'
                    : command.outcome === 'error'
                      ? 'ad-error'
                      : 'ad-no-fill';

              publish(
                createEvent('domain/help-action-failed', correlationId, {
                  commandType: command.type,
                  operationId: command.operationId,
                  helpKind: command.helpType,
                  source: 'rewarded-ad',
                  reason,
                  levelId: helpApplyResult?.levelId ?? previousCoreState.gameplay.levelId,
                  stateVersion:
                    helpApplyResult?.stateVersion ?? previousCoreState.gameplay.stateVersion,
                  allTimeScore:
                    helpApplyResult?.allTimeScore ?? previousCoreState.gameplay.allTimeScore,
                  outcome: command.outcome,
                  durationMs,
                  outcomeContext,
                  cooldownApplied: finalizeResult.cooldownApplied,
                  cooldownDurationMs: finalizeResult.cooldownDurationMs,
                  toastMessage,
                }),
              );
            });
          }
          case 'AcknowledgeWordSuccessAnimation': {
            const ackResult = modules.coreState.acknowledgeWordSuccessAnimation(
              command.operationId,
            );
            return routeCommand(command.type, command.operationId, (correlationId) => {
              publish(
                createEvent('domain/word-success', correlationId, {
                  commandType: command.type,
                  wordId: command.wordId,
                  levelClearAwarded: ackResult.levelClearAwarded,
                  scoreDelta: {
                    wordScore: ackResult.scoreDelta.wordScore,
                    levelClearScore: ackResult.scoreDelta.levelClearScore,
                    totalScore: ackResult.scoreDelta.totalScore,
                  },
                  allTimeScore: ackResult.allTimeScore,
                }),
              );
            });
          }
          case 'AcknowledgeLevelTransitionDone': {
            const previousCoreState = modules.coreState.getSnapshot();
            modules.coreState.acknowledgeLevelTransitionDone(command.operationId);
            const nextCoreState = modules.coreState.getSnapshot();
            return routeCommand(command.type, command.operationId, (correlationId) => {
              publish(
                createEvent('domain/level-clear', correlationId, {
                  commandType: command.type,
                }),
              );
              publishDisplayedTargetChanged(
                command.type,
                'level-transition',
                correlationId,
                previousCoreState,
                nextCoreState,
              );
            });
          }
          case 'RestoreSession': {
            const previousCoreState = modules.coreState.getSnapshot();
            const restorePayload = command.payload;
            const restoreTs = Date.now();
            const restoreResult = modules.coreState.restoreSession(
              {
                localSnapshot: {
                  gameStateSerialized: restorePayload?.localSnapshot?.gameStateSerialized ?? null,
                },
                cloudSnapshot: {
                  gameStateSerialized: restorePayload?.cloudSnapshot?.gameStateSerialized ?? null,
                },
                cloudAllTimeScore: restorePayload?.cloudAllTimeScore ?? null,
              },
              restoreTs,
            );
            const restoredHelpWindow =
              resolveRestoreHelpWindow(restorePayload, restoreResult.source) ??
              (() => {
                const snapshot = modules.coreState.getSnapshot().gameState.helpWindow;
                return {
                  windowStartTs: snapshot.windowStartTs,
                  freeActionAvailable: snapshot.freeActionAvailable,
                };
              })();
            modules.helpEconomy.restoreWindowState(
              {
                windowStartTs: restoredHelpWindow.windowStartTs,
                freeActionAvailable: restoredHelpWindow.freeActionAvailable,
              },
              restoreTs,
            );

            return routeCommand(command.type, null, (correlationId) => {
              publish(
                createEvent('domain/persistence', correlationId, {
                  commandType: command.type,
                  operation: 'restore-session',
                }),
              );
              publishDisplayedTargetChanged(
                command.type,
                'restore-session',
                correlationId,
                previousCoreState,
                modules.coreState.getSnapshot(),
              );
            });
          }
          case 'SyncLeaderboard': {
            const requestedScore = modules.coreState.getSnapshot().gameplay.allTimeScore;
            return routeCommand(command.type, null, (correlationId) => {
              publish(
                createEvent('domain/leaderboard-sync', correlationId, {
                  commandType: command.type,
                  operation: 'sync-score',
                  requestedScore,
                }),
              );
            });
          }
          default: {
            return assertNever(command);
          }
        }
      } catch (error: unknown) {
        return infraError('command.execution-failed', 'Command handler crashed.', {
          commandType: command.type,
          reason: toErrorMessage(error),
        });
      }
    },
  };

  const queryBus: ApplicationQueryBus = {
    execute: <TQuery extends ApplicationQuery>(
      query: TQuery,
    ): ApplicationResult<ApplicationQueryPayload<TQuery>> => {
      try {
        switch (query.type) {
          case 'GetCoreState': {
            return ok(modules.coreState.getSnapshot()) as ApplicationResult<
              ApplicationQueryPayload<TQuery>
            >;
          }
          case 'GetHelpWindowState': {
            return ok(modules.helpEconomy.getWindowState(Date.now())) as ApplicationResult<
              ApplicationQueryPayload<TQuery>
            >;
          }
          default: {
            return assertNever(query);
          }
        }
      } catch (error: unknown) {
        return infraError('query.execution-failed', 'Query handler crashed.', {
          queryType: query.type,
          reason: toErrorMessage(error),
        });
      }
    },
  };

  const readModel: ApplicationReadModel = {
    getCoreState: () => {
      const queryResult = queryBus.execute({ type: 'GetCoreState' });

      if (queryResult.type !== 'ok') {
        throw new Error(
          `[application/read-model] Failed to resolve GetCoreState: ${queryResult.error.code}`,
        );
      }

      return queryResult.value;
    },
    getHelpWindowState: () => {
      const queryResult = queryBus.execute({
        type: 'GetHelpWindowState',
      });

      if (queryResult.type !== 'ok') {
        throw new Error(
          `[application/read-model] Failed to resolve GetHelpWindowState: ${queryResult.error.code}`,
        );
      }

      return queryResult.value;
    },
  };

  return {
    commands: commandBus,
    queries: queryBus,
    readModel,
    events: eventBus,
  };
}

export type {
  ApplicationCommand,
  ApplicationCommandBus,
  ApplicationError,
  ApplicationEvent,
  ApplicationEventBus,
  ApplicationLayer,
  ApplicationQuery,
  ApplicationQueryBus,
  ApplicationQueryPayload,
  ApplicationReadModel,
  ApplicationResult,
  CommandAck,
  DomainModules,
  GridCellRef,
  PersistedHelpWindowSnapshot,
  PersistedSessionSnapshot,
  RestoreSessionPayload,
  RewardedAdOutcome,
} from './contracts';
