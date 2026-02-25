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
  RoutedCommandType,
} from './contracts';
import { toErrorMessage } from '../shared/errors';

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
  'domain/word-success': 1,
  'domain/level-clear': 1,
  'domain/help': 1,
  'domain/persistence': 1,
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

export function createApplicationLayer(modules: DomainModules): ApplicationLayer {
  type EventType = ApplicationEvent['eventType'];
  type EventByType<TType extends EventType> = Extract<ApplicationEvent, { eventType: TType }>;

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

    if (decision.type === 'apply-now') {
      const helpApplyResult = modules.coreState.applyHelp(
        helpKind,
        decision.operationId,
        requestedAt,
      );
      applied = helpApplyResult.applied;
      modules.helpEconomy.finalizePendingRequest(
        decision.operationId,
        helpApplyResult.applied,
        requestedAt,
      );
    }

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

            const submitResult = modules.coreState.submitPath(command.pathCells);
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
                    pathCells: command.pathCells.map((cell) => ({ ...cell })),
                  }),
                );
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
            const acknowledgedAt = Date.now();
            const helpWindowState = modules.helpEconomy.getWindowState(acknowledgedAt);
            const pendingRequest = helpWindowState.pendingRequest;
            const isMatchingPendingRequest =
              pendingRequest?.operationId === command.operationId &&
              pendingRequest.kind === command.helpType;
            const shouldApplyHelp = isMatchingPendingRequest && command.outcome === 'reward';
            const helpApplyResult = shouldApplyHelp
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
            });
          }
          case 'AcknowledgeWordSuccessAnimation': {
            modules.coreState.acknowledgeWordSuccessAnimation(command.operationId);
            return routeCommand(command.type, command.operationId, (correlationId) => {
              publish(
                createEvent('domain/word-success', correlationId, {
                  commandType: command.type,
                  wordId: command.wordId,
                }),
              );
            });
          }
          case 'AcknowledgeLevelTransitionDone': {
            modules.coreState.acknowledgeLevelTransitionDone(command.operationId);
            return routeCommand(command.type, command.operationId, (correlationId) => {
              publish(
                createEvent('domain/level-clear', correlationId, {
                  commandType: command.type,
                }),
              );
            });
          }
          case 'RestoreSession': {
            return routeCommand(command.type, null, (correlationId) => {
              publish(
                createEvent('domain/persistence', correlationId, {
                  commandType: command.type,
                  operation: 'restore-session',
                }),
              );
            });
          }
          case 'SyncLeaderboard': {
            return routeCommand(command.type, null, (correlationId) => {
              publish(
                createEvent('domain/leaderboard-sync', correlationId, {
                  commandType: command.type,
                  operation: 'sync-score',
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
  RewardedAdOutcome,
} from './contracts';
