import { MODULE_IDS } from '../../shared/module-ids';

export type HelpKind = 'hint' | 'reshuffle';
export const HELP_WINDOW_DURATION_MS = 5 * 60 * 1000;

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
}

export type HelpRequestDecision =
  | {
      readonly type: 'locked';
      readonly kind: HelpKind;
      readonly pendingOperationId: string;
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
  readonly windowState: HelpWindowState;
}

export interface HelpEconomyModuleOptions {
  readonly windowStartTs?: number;
  readonly freeActionAvailable?: boolean;
  readonly nowProvider?: () => number;
}

export interface HelpEconomyModule {
  readonly moduleName: typeof MODULE_IDS.helpEconomy;
  getWindowState: (nowTs?: number) => HelpWindowState;
  requestHelp: (kind: HelpKind, nowTs?: number) => HelpRequestDecision;
  finalizePendingRequest: (
    operationId: string,
    applied: boolean,
    nowTs?: number,
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
  let windowStartTs = normalizeTimestamp(options.windowStartTs ?? nowProvider(), nowProvider());
  let freeActionAvailable = options.freeActionAvailable ?? true;
  let pendingRequest: HelpPendingRequestState | null = null;
  let operationSequence = 0;

  const alignWindowState = (nowTs: number): number => {
    const normalizedNowTs = normalizeTimestamp(nowTs, nowProvider());

    if (normalizedNowTs < windowStartTs) {
      return normalizedNowTs;
    }

    const elapsedMs = normalizedNowTs - windowStartTs;
    if (elapsedMs < HELP_WINDOW_DURATION_MS) {
      return normalizedNowTs;
    }

    const elapsedWindows = Math.floor(elapsedMs / HELP_WINDOW_DURATION_MS);
    windowStartTs += elapsedWindows * HELP_WINDOW_DURATION_MS;
    freeActionAvailable = true;

    return normalizedNowTs;
  };

  const createWindowState = (nowTs: number): HelpWindowState => {
    const normalizedNowTs = alignWindowState(nowTs);
    const nextFreeActionAt = windowStartTs + HELP_WINDOW_DURATION_MS;
    const msUntilNextFreeAction = freeActionAvailable
      ? 0
      : Math.max(0, nextFreeActionAt - normalizedNowTs);

    return {
      windowStartTs,
      freeActionAvailable,
      nextFreeActionAt,
      msUntilNextFreeAction,
      isLocked: pendingRequest !== null,
      pendingRequest,
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
    requestHelp: (kind, nowTs = nowProvider()) => {
      const windowState = createWindowState(nowTs);
      if (windowState.pendingRequest) {
        return {
          type: 'locked',
          kind,
          pendingOperationId: windowState.pendingRequest.operationId,
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
    finalizePendingRequest: (operationId, applied, nowTs = nowProvider()) => {
      const normalizedOperationId = trimOperationId(operationId);
      if (!pendingRequest || pendingRequest.operationId !== normalizedOperationId) {
        return {
          operationId: normalizedOperationId,
          kind: null,
          finalized: false,
          applied: false,
          freeActionConsumed: false,
          windowState: createWindowState(nowTs),
        };
      }

      const freeActionConsumed = pendingRequest.isFreeAction && applied;
      const finalizedKind = pendingRequest.kind;
      pendingRequest = null;

      if (freeActionConsumed) {
        freeActionAvailable = false;
      }

      return {
        operationId: normalizedOperationId,
        kind: finalizedKind,
        finalized: true,
        applied,
        freeActionConsumed,
        windowState: createWindowState(nowTs),
      };
    },
  };
}
