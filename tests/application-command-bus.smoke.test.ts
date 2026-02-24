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
        (event): event is Extract<ApplicationEvent, { type: 'application/command-routed' }> => {
          return event.type === 'application/command-routed';
        },
      )
      .map((event) => event.commandType);

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

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'application/runtime-ready',
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'application/tick',
        at: 123_456,
      }),
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
});
