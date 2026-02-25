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
  'domain/word-success': 1,
  'domain/level-clear': 1,
  'domain/help': 1,
  'domain/persistence': 1,
  'domain/leaderboard-sync': 1,
};

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
    const decision = modules.helpEconomy.requestHelp(helpKind, Date.now());
    return routeCommand(commandType, decision.operationId, (correlationId) => {
      publish(
        createEvent('domain/help', correlationId, {
          phase: 'requested',
          commandType,
          helpKind: decision.kind,
          isFreeAction: decision.isFreeAction,
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

            modules.coreState.submitPath(command.pathCells);
            return routeCommand(command.type);
          }
          case 'RequestHint': {
            return routeHelpCommand(command.type, 'hint');
          }
          case 'RequestReshuffle': {
            return routeHelpCommand(command.type, 'reshuffle');
          }
          case 'AcknowledgeAdResult': {
            return routeCommand(command.type, command.operationId, (correlationId) => {
              publish(
                createEvent('domain/help', correlationId, {
                  phase: 'ad-result',
                  commandType: command.type,
                  helpKind: command.helpType,
                  outcome: command.outcome,
                }),
              );
            });
          }
          case 'AcknowledgeWordSuccessAnimation': {
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
            return ok(modules.helpEconomy.getWindowState()) as ApplicationResult<
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
