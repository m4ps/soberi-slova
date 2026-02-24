import type { ApplicationCommandBus, ApplicationEventBus } from '../../application';

export interface PlatformYandexModule {
  readonly moduleName: 'PlatformYandex';
  bootstrap: () => Promise<void>;
  dispose: () => void;
}

export function createPlatformYandexModule(
  commandBus: ApplicationCommandBus,
  eventBus: ApplicationEventBus,
): PlatformYandexModule {
  let unsubscribe: (() => void) | null = null;

  return {
    moduleName: 'PlatformYandex',
    bootstrap: async () => {
      if (!unsubscribe) {
        unsubscribe = eventBus.subscribe(() => {
          // SDK lifecycle wiring will be added in INIT-004.
        });
      }

      commandBus.dispatch({ type: 'RuntimeReady' });
    },
    dispose: () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  };
}
