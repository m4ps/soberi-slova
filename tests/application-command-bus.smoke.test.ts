import { describe, expect, it } from 'vitest';

import {
  createApplicationLayer,
  type ApplicationCommand,
  type ApplicationEvent,
} from '../src/application';
import { createCoreStateModule } from '../src/domain/CoreState';
import { createHelpEconomyModule } from '../src/domain/HelpEconomy';

function createSmokeApplication() {
  return createApplicationLayer({
    coreState: createCoreStateModule(),
    helpEconomy: createHelpEconomyModule(0),
  });
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
      expect(helpWindowResult.value.freeActionAvailable).toBe(true);
      expect(helpWindowResult.value.windowStartTs).toBe(0);
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
        helpKind: 'hint',
        outcome: 'reward',
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
});
