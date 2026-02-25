import type { ApplicationEvent, ApplicationEventBus } from '../../application';
import { MODULE_IDS } from '../../shared/module-ids';

export interface TelemetryModule {
  readonly moduleName: typeof MODULE_IDS.telemetry;
  start: () => void;
  stop: () => void;
  getBufferedEvents: () => readonly ApplicationEvent[];
}

export function createTelemetryModule(eventBus: ApplicationEventBus): TelemetryModule {
  const bufferedEvents: ApplicationEvent[] = [];
  let unsubscribe: (() => void) | null = null;

  return {
    moduleName: MODULE_IDS.telemetry,
    start: () => {
      if (!unsubscribe) {
        unsubscribe = eventBus.subscribe((event) => {
          bufferedEvents.push(event);
        });
      }
    },
    stop: () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
    getBufferedEvents: () => bufferedEvents,
  };
}
