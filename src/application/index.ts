import type {
  ApplicationCommand,
  ApplicationEvent,
  ApplicationEventBus,
  ApplicationEventListener,
  ApplicationLayer,
  DomainModules,
} from './contracts';

function assertNever(value: never): never {
  throw new Error(`Unsupported command: ${JSON.stringify(value)}`);
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

  return {
    commands: {
      dispatch: (command: ApplicationCommand) => {
        switch (command.type) {
          case 'bootstrap/ready': {
            modules.coreState.setRuntimeMode('ready');
            publish({ type: 'application/runtime-ready', at: Date.now() });
            return;
          }
          case 'bootstrap/tick': {
            publish({ type: 'application/tick', at: command.nowTs });
            return;
          }
          default: {
            assertNever(command);
          }
        }
      },
    },
    readModel: {
      getCoreState: modules.coreState.getSnapshot,
    },
    events: eventBus,
  };
}

export type {
  ApplicationCommand,
  ApplicationCommandBus,
  ApplicationEvent,
  ApplicationEventBus,
  ApplicationLayer,
  ApplicationReadModel,
  DomainModules,
} from './contracts';
