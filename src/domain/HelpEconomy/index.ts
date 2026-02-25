import { MODULE_IDS } from '../../shared/module-ids';

export type HelpKind = 'hint' | 'reshuffle';
export const HELP_WINDOW_DURATION_MS = 5 * 60 * 1000;
export const HELP_AD_FAILURE_COOLDOWN_MS = 3 * 1_000;
export type HelpAdOutcome = 'reward' | 'close' | 'error' | 'no-fill';
export type HelpAdFailureOutcome = Exclude<HelpAdOutcome, 'reward'>;

export interface HelpPendingRequestState {
  readonly operationId: string;
  readonly kind: HelpKind;
  readonly isFreeAction: boolean;
}

export interface HelpWindowState {
  readonly windowStartTs: number;
  readonly freeActionAvailable: boolean;
  readonly nextFreeActionAt: number;
  readonly msUntilNextFreeAction: number;
  readonly isLocked: boolean;
  readonly pendingRequest: HelpPendingRequestState | null;
  readonly cooldownUntilTs: number;
  readonly cooldownMsRemaining: number;
  readonly cooldownReason: HelpAdFailureOutcome | null;
}

export interface HelpWindowRestoreInput {
  readonly windowStartTs: number;
  readonly freeActionAvailable: boolean;
}

export type HelpRequestDecision =
  | {
      readonly type: 'locked';
      readonly kind: HelpKind;
      readonly pendingOperationId: string;
    }
  | {
      readonly type: 'cooldown';
      readonly kind: HelpKind;
      readonly cooldownUntilTs: number;
      readonly cooldownMsRemaining: number;
      readonly cooldownReason: HelpAdFailureOutcome;
    }
  | {
      readonly type: 'apply-now';
      readonly kind: HelpKind;
      readonly operationId: string;
      readonly isFreeAction: true;
    }
  | {
      readonly type: 'await-ad';
      readonly kind: HelpKind;
      readonly operationId: string;
      readonly isFreeAction: false;
    };

export interface HelpFinalizeResult {
  readonly operationId: string;
  readonly kind: HelpKind | null;
  readonly finalized: boolean;
  readonly applied: boolean;
  readonly freeActionConsumed: boolean;
  readonly cooldownApplied: boolean;
  readonly cooldownDurationMs: number;
  readonly windowState: HelpWindowState;
}

export interface HelpEconomyModuleOptions {
  readonly windowStartTs?: number;
  readonly freeActionAvailable?: boolean;
  readonly adFailureCooldownMs?: number;
  readonly nowProvider?: () => number;
}

export interface HelpEconomyModule {
  readonly moduleName: typeof MODULE_IDS.helpEconomy;
  getWindowState: (nowTs?: number) => HelpWindowState;
  restoreWindowState: (input: HelpWindowRestoreInput, nowTs?: number) => HelpWindowState;
  requestHelp: (kind: HelpKind, nowTs?: number) => HelpRequestDecision;
  finalizePendingRequest: (
    operationId: string,
    applied: boolean,
    nowTs?: number,
    adOutcome?: HelpAdOutcome,
  ) => HelpFinalizeResult;
}

function normalizeTimestamp(candidateTs: number, fallbackTs: number): number {
  if (Number.isFinite(candidateTs)) {
    return Math.max(0, Math.trunc(candidateTs));
  }

  return Math.max(0, Math.trunc(fallbackTs));
}

function trimOperationId(operationId: string): string {
  return operationId.trim();
}

function normalizeCooldownDuration(candidateMs: number, fallbackMs: number): number {
  if (!Number.isFinite(candidateMs)) {
    return Math.max(0, Math.trunc(fallbackMs));
  }

  return Math.max(0, Math.trunc(candidateMs));
}

function isAdFailureOutcome(outcome: HelpAdOutcome | undefined): outcome is HelpAdFailureOutcome {
  return outcome === 'close' || outcome === 'error' || outcome === 'no-fill';
}

function resolveOptions(
  optionsOrWindowStartTs: number | HelpEconomyModuleOptions | undefined,
): HelpEconomyModuleOptions {
  if (typeof optionsOrWindowStartTs === 'number') {
    return {
      windowStartTs: optionsOrWindowStartTs,
    };
  }

  return optionsOrWindowStartTs ?? {};
}

export function createHelpEconomyModule(
  optionsOrWindowStartTs?: number | HelpEconomyModuleOptions,
): HelpEconomyModule {
  const options = resolveOptions(optionsOrWindowStartTs);
  const nowProvider = options.nowProvider ?? (() => Date.now());
  const adFailureCooldownMs = normalizeCooldownDuration(
    options.adFailureCooldownMs ?? HELP_AD_FAILURE_COOLDOWN_MS,
    HELP_AD_FAILURE_COOLDOWN_MS,
  );
  let windowStartTs = normalizeTimestamp(options.windowStartTs ?? nowProvider(), nowProvider());
  let freeActionAvailable = options.freeActionAvailable ?? true;
  let pendingRequest: HelpPendingRequestState | null = null;
  let cooldownUntilTs = 0;
  let cooldownReason: HelpAdFailureOutcome | null = null;
  let operationSequence = 0;

  const alignWindowState = (nowTs: number): number => {
    const normalizedNowTs = normalizeTimestamp(nowTs, nowProvider());

    if (normalizedNowTs < windowStartTs) {
      return normalizedNowTs;
    }

    const elapsedMs = normalizedNowTs - windowStartTs;
    if (elapsedMs < HELP_WINDOW_DURATION_MS) {
      if (normalizedNowTs >= cooldownUntilTs) {
        cooldownUntilTs = 0;
        cooldownReason = null;
      }

      return normalizedNowTs;
    }

    const elapsedWindows = Math.floor(elapsedMs / HELP_WINDOW_DURATION_MS);
    windowStartTs += elapsedWindows * HELP_WINDOW_DURATION_MS;
    freeActionAvailable = true;

    if (normalizedNowTs >= cooldownUntilTs) {
      cooldownUntilTs = 0;
      cooldownReason = null;
    }

    return normalizedNowTs;
  };

  const createWindowState = (nowTs: number): HelpWindowState => {
    const normalizedNowTs = alignWindowState(nowTs);
    const nextFreeActionAt = windowStartTs + HELP_WINDOW_DURATION_MS;
    const msUntilNextFreeAction = freeActionAvailable
      ? 0
      : Math.max(0, nextFreeActionAt - normalizedNowTs);
    const cooldownMsRemaining = Math.max(0, cooldownUntilTs - normalizedNowTs);
    const isCooldownActive = cooldownMsRemaining > 0;

    return {
      windowStartTs,
      freeActionAvailable,
      nextFreeActionAt,
      msUntilNextFreeAction,
      isLocked: pendingRequest !== null || isCooldownActive,
      pendingRequest,
      cooldownUntilTs,
      cooldownMsRemaining,
      cooldownReason: isCooldownActive ? cooldownReason : null,
    };
  };

  const createOperationId = (kind: HelpKind, nowTs: number): string => {
    operationSequence += 1;
    return `help-${kind}-${nowTs}-${operationSequence}`;
  };

  return {
    moduleName: MODULE_IDS.helpEconomy,
    getWindowState: (nowTs = nowProvider()) => {
      return createWindowState(nowTs);
    },
    restoreWindowState: (input, nowTs = nowProvider()) => {
      windowStartTs = normalizeTimestamp(input.windowStartTs, nowProvider());
      freeActionAvailable = input.freeActionAvailable === true;
      pendingRequest = null;
      cooldownUntilTs = 0;
      cooldownReason = null;

      return createWindowState(nowTs);
    },
    requestHelp: (kind, nowTs = nowProvider()) => {
      const windowState = createWindowState(nowTs);
      if (windowState.pendingRequest) {
        return {
          type: 'locked',
          kind,
          pendingOperationId: windowState.pendingRequest.operationId,
        };
      }

      if (windowState.cooldownMsRemaining > 0) {
        return {
          type: 'cooldown',
          kind,
          cooldownUntilTs: windowState.cooldownUntilTs,
          cooldownMsRemaining: windowState.cooldownMsRemaining,
          cooldownReason: windowState.cooldownReason ?? 'error',
        };
      }

      const operationId = createOperationId(kind, normalizeTimestamp(nowTs, nowProvider()));
      if (windowState.freeActionAvailable) {
        pendingRequest = {
          operationId,
          kind,
          isFreeAction: true,
        };

        return {
          type: 'apply-now',
          kind,
          operationId,
          isFreeAction: true,
        };
      }

      pendingRequest = {
        operationId,
        kind,
        isFreeAction: false,
      };

      return {
        type: 'await-ad',
        kind,
        operationId,
        isFreeAction: false,
      };
    },
    finalizePendingRequest: (operationId, applied, nowTs = nowProvider(), adOutcome) => {
      const normalizedOperationId = trimOperationId(operationId);
      if (!pendingRequest || pendingRequest.operationId !== normalizedOperationId) {
        return {
          operationId: normalizedOperationId,
          kind: null,
          finalized: false,
          applied: false,
          freeActionConsumed: false,
          cooldownApplied: false,
          cooldownDurationMs: 0,
          windowState: createWindowState(nowTs),
        };
      }

      const finalizedRequest = pendingRequest;
      const freeActionConsumed = pendingRequest.isFreeAction && applied;
      const finalizedKind = pendingRequest.kind;
      let cooldownApplied = false;
      pendingRequest = null;

      if (freeActionConsumed) {
        freeActionAvailable = false;
      }

      if (!applied && !finalizedRequest.isFreeAction && isAdFailureOutcome(adOutcome)) {
        cooldownUntilTs = normalizeTimestamp(nowTs, nowProvider()) + adFailureCooldownMs;
        cooldownReason = adOutcome;
        cooldownApplied = true;
      } else if (normalizeTimestamp(nowTs, nowProvider()) >= cooldownUntilTs) {
        cooldownUntilTs = 0;
        cooldownReason = null;
      }

      return {
        operationId: normalizedOperationId,
        kind: finalizedKind,
        finalized: true,
        applied,
        freeActionConsumed,
        cooldownApplied,
        cooldownDurationMs: cooldownApplied ? adFailureCooldownMs : 0,
        windowState: createWindowState(nowTs),
      };
    },
  };
}
