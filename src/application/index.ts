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
} from './contracts';

function assertNever(value: never): never {
  throw new Error(`Unsupported command: ${JSON.stringify(value)}`);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
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

export function createApplicationLayer(modules: DomainModules): ApplicationLayer {
  const eventListeners = new Set<ApplicationEventListener>();

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

  const acknowledge = (commandType: ApplicationCommand['type']): ApplicationResult<CommandAck> =>
    ok({
      commandType,
      handledAt: Date.now(),
    });

  const publishCommandRouted = (
    commandType: Exclude<ApplicationCommand['type'], 'RuntimeReady' | 'Tick'>,
    correlationId: string | null = null,
  ): void => {
    publish({
      type: 'application/command-routed',
      commandType,
      at: Date.now(),
      correlationId,
    });
  };

  const commandBus = {
    dispatch: (command: ApplicationCommand): ApplicationResult<CommandAck> => {
      try {
        switch (command.type) {
          case 'RuntimeReady': {
            modules.coreState.setRuntimeMode('ready');
            publish({ type: 'application/runtime-ready', at: Date.now() });
            return acknowledge(command.type);
          }
          case 'Tick': {
            publish({ type: 'application/tick', at: command.nowTs });
            return acknowledge(command.type);
          }
          case 'SubmitPath': {
            if (command.pathCells.length === 0) {
              return domainError(
                'submit-path.empty',
                'SubmitPath requires at least one grid cell.',
                { pathCells: command.pathCells },
              );
            }

            publishCommandRouted(command.type);
            return acknowledge(command.type);
          }
          case 'RequestHint': {
            const decision = modules.helpEconomy.requestHelp('hint', Date.now());
            publishCommandRouted(command.type, decision.operationId);
            return acknowledge(command.type);
          }
          case 'RequestReshuffle': {
            const decision = modules.helpEconomy.requestHelp('reshuffle', Date.now());
            publishCommandRouted(command.type, decision.operationId);
            return acknowledge(command.type);
          }
          case 'AcknowledgeAdResult': {
            publishCommandRouted(command.type, command.operationId);
            return acknowledge(command.type);
          }
          case 'AcknowledgeWordSuccessAnimation': {
            publishCommandRouted(command.type, command.operationId);
            return acknowledge(command.type);
          }
          case 'AcknowledgeLevelTransitionDone': {
            publishCommandRouted(command.type, command.operationId);
            return acknowledge(command.type);
          }
          case 'RestoreSession': {
            publishCommandRouted(command.type);
            return acknowledge(command.type);
          }
          case 'SyncLeaderboard': {
            publishCommandRouted(command.type);
            return acknowledge(command.type);
          }
          default: {
            return assertNever(command);
          }
        }
      } catch (error: unknown) {
        return infraError(
          'command.execution-failed',
          'Command handler crashed.',
          { commandType: command.type, reason: toErrorMessage(error) },
        );
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
            return ok(
              modules.coreState.getSnapshot(),
            ) as ApplicationResult<ApplicationQueryPayload<TQuery>>;
          }
          case 'GetHelpWindowState': {
            return ok(
              modules.helpEconomy.getWindowState(),
            ) as ApplicationResult<ApplicationQueryPayload<TQuery>>;
          }
          default: {
            return assertNever(query);
          }
        }
      } catch (error: unknown) {
        return infraError(
          'query.execution-failed',
          'Query handler crashed.',
          { queryType: query.type, reason: toErrorMessage(error) },
        );
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
