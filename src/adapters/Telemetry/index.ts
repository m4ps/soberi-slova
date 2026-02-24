import type { ApplicationEvent, ApplicationEventBus } from '../../application';

export interface TelemetryModule {
  readonly moduleName: 'Telemetry';
  start: () => void;
  stop: () => void;
  getBufferedEvents: () => readonly ApplicationEvent[];
}

export function createTelemetryModule(eventBus: ApplicationEventBus): TelemetryModule {
  const bufferedEvents: ApplicationEvent[] = [];
  let unsubscribe: (() => void) | null = null;

  return {
    moduleName: 'Telemetry',
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
