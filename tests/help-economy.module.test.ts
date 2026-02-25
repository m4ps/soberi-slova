import { describe, expect, it } from 'vitest';

import {
  HELP_AD_FAILURE_COOLDOWN_MS,
  HELP_WINDOW_DURATION_MS,
  createHelpEconomyModule,
} from '../src/domain/HelpEconomy';

describe('help economy module', () => {
  it('restores window state and drops transient pending/cooldown locks', () => {
    const helpEconomy = createHelpEconomyModule({
      windowStartTs: 0,
      freeActionAvailable: false,
    });

    const adRequest = helpEconomy.requestHelp('hint', 100);
    if (adRequest.type !== 'await-ad') {
      throw new Error('Expected ad-required help request.');
    }

    helpEconomy.finalizePendingRequest(adRequest.operationId, false, 120, 'error');
    expect(helpEconomy.getWindowState(121).isLocked).toBe(true);

    const restoredWindow = helpEconomy.restoreWindowState(
      {
        windowStartTs: 500,
        freeActionAvailable: true,
      },
      550,
    );

    expect(restoredWindow).toMatchObject({
      windowStartTs: 500,
      freeActionAvailable: true,
      isLocked: false,
      pendingRequest: null,
      cooldownUntilTs: 0,
      cooldownReason: null,
    });
  });

  it('consumes free action only after successful help application', () => {
    const helpEconomy = createHelpEconomyModule({
      windowStartTs: 1_000,
      freeActionAvailable: true,
    });

    const firstRequest = helpEconomy.requestHelp('hint', 1_100);
    expect(firstRequest).toMatchObject({
      type: 'apply-now',
      kind: 'hint',
      isFreeAction: true,
    });

    const pendingState = helpEconomy.getWindowState(1_100);
    expect(pendingState).toMatchObject({
      freeActionAvailable: true,
      isLocked: true,
      pendingRequest: {
        kind: 'hint',
        isFreeAction: true,
      },
    });

    if (firstRequest.type !== 'apply-now') {
      throw new Error('Expected free request to be apply-now.');
    }

    const failedFinalize = helpEconomy.finalizePendingRequest(
      firstRequest.operationId,
      false,
      1_120,
    );
    expect(failedFinalize).toMatchObject({
      operationId: firstRequest.operationId,
      finalized: true,
      applied: false,
      freeActionConsumed: false,
    });
    expect(failedFinalize.windowState.freeActionAvailable).toBe(true);

    const secondRequest = helpEconomy.requestHelp('reshuffle', 1_130);
    expect(secondRequest).toMatchObject({
      type: 'apply-now',
      kind: 'reshuffle',
      isFreeAction: true,
    });
    if (secondRequest.type !== 'apply-now') {
      throw new Error('Expected second free request to be apply-now.');
    }

    const successfulFinalize = helpEconomy.finalizePendingRequest(
      secondRequest.operationId,
      true,
      1_140,
    );
    expect(successfulFinalize).toMatchObject({
      operationId: secondRequest.operationId,
      finalized: true,
      applied: true,
      freeActionConsumed: true,
    });
    expect(successfulFinalize.windowState.freeActionAvailable).toBe(false);
  });

  it('restores free action after full 5-minute window in real time', () => {
    const helpEconomy = createHelpEconomyModule({
      windowStartTs: 0,
      freeActionAvailable: false,
    });

    const nearBoundaryState = helpEconomy.getWindowState(HELP_WINDOW_DURATION_MS - 1);
    expect(nearBoundaryState.freeActionAvailable).toBe(false);
    expect(nearBoundaryState.msUntilNextFreeAction).toBe(1);

    const restoredState = helpEconomy.getWindowState(HELP_WINDOW_DURATION_MS + 25);
    expect(restoredState.freeActionAvailable).toBe(true);
    expect(restoredState.msUntilNextFreeAction).toBe(0);
    expect(restoredState.windowStartTs).toBe(HELP_WINDOW_DURATION_MS);
  });

  it('blocks re-entrant help requests while one request is pending', () => {
    const helpEconomy = createHelpEconomyModule({
      windowStartTs: 2_000,
      freeActionAvailable: false,
    });

    const firstRequest = helpEconomy.requestHelp('hint', 2_100);
    expect(firstRequest.type).toBe('await-ad');
    if (firstRequest.type !== 'await-ad') {
      throw new Error('Expected ad-required request.');
    }

    const blockedRequest = helpEconomy.requestHelp('reshuffle', 2_101);
    expect(blockedRequest).toEqual({
      type: 'locked',
      kind: 'reshuffle',
      pendingOperationId: firstRequest.operationId,
    });

    const wrongFinalize = helpEconomy.finalizePendingRequest('unknown-op', false, 2_200);
    expect(wrongFinalize.finalized).toBe(false);
    expect(helpEconomy.getWindowState(2_200).isLocked).toBe(true);

    const finalize = helpEconomy.finalizePendingRequest(firstRequest.operationId, false, 2_300);
    expect(finalize.finalized).toBe(true);
    expect(helpEconomy.getWindowState(2_300).isLocked).toBe(false);
  });

  it('applies cooldown after ad failure outcomes and unlocks after cooldown window', () => {
    const helpEconomy = createHelpEconomyModule({
      windowStartTs: 1_000,
      freeActionAvailable: false,
    });

    const firstRequest = helpEconomy.requestHelp('hint', 1_100);
    expect(firstRequest.type).toBe('await-ad');
    if (firstRequest.type !== 'await-ad') {
      throw new Error('Expected ad-required request.');
    }

    const finalize = helpEconomy.finalizePendingRequest(
      firstRequest.operationId,
      false,
      1_120,
      'no-fill',
    );
    expect(finalize).toMatchObject({
      finalized: true,
      applied: false,
      cooldownApplied: true,
      cooldownDurationMs: HELP_AD_FAILURE_COOLDOWN_MS,
    });
    expect(finalize.windowState.isLocked).toBe(true);
    expect(finalize.windowState.cooldownReason).toBe('no-fill');

    const blockedByCooldown = helpEconomy.requestHelp('reshuffle', 1_200);
    expect(blockedByCooldown).toMatchObject({
      type: 'cooldown',
      kind: 'reshuffle',
      cooldownReason: 'no-fill',
    });
    if (blockedByCooldown.type !== 'cooldown') {
      throw new Error('Expected cooldown lock.');
    }
    expect(blockedByCooldown.cooldownMsRemaining).toBeGreaterThan(0);

    const afterCooldownRequest = helpEconomy.requestHelp(
      'reshuffle',
      1_120 + HELP_AD_FAILURE_COOLDOWN_MS + 1,
    );
    expect(afterCooldownRequest.type).toBe('await-ad');
  });
});
