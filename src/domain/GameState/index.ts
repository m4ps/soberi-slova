import type { HelpKind } from '../HelpEconomy';

export const GAME_STATE_SCHEMA_VERSION = 1;

export type LevelSessionStatus = 'active' | 'completed' | 'reshuffling';

export type PendingOperationKind =
  | 'help-hint'
  | 'help-reshuffle'
  | 'word-success-animation'
  | 'level-transition'
  | 'restore-session'
  | 'leaderboard-sync';

export type PendingOperationStatus = 'pending' | 'applied' | 'failed';

export interface WordEntry {
  readonly id: number;
  readonly bare: string;
  readonly rank: number;
  readonly type: string;
  readonly normalized: string;
}

export interface PendingHelpRequest {
  readonly operationId: string;
  readonly kind: HelpKind;
  readonly requestedAt: number;
}

export interface HelpWindow {
  readonly windowStartTs: number;
  readonly freeActionAvailable: boolean;
  readonly pendingHelpRequest: PendingHelpRequest | null;
}

export interface PendingOperation {
  readonly operationId: string;
  readonly kind: PendingOperationKind;
  readonly status: PendingOperationStatus;
  readonly retryCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface LeaderboardSyncState {
  readonly lastSubmittedScore: number;
  readonly lastAckScore: number;
  readonly lastSubmitTs: number;
}

export type LevelSessionMetaValue = string | number | boolean | null;

export interface LevelSession {
  readonly levelId: string;
  readonly grid: readonly string[];
  readonly targetWords: readonly string[];
  readonly foundTargets: readonly string[];
  readonly foundBonuses: readonly string[];
  readonly status: LevelSessionStatus;
  readonly seed: number;
  readonly meta: Readonly<Record<string, LevelSessionMetaValue>>;
}

export interface GameState {
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly updatedAt: number;
  readonly allTimeScore: number;
  readonly currentLevelSession: LevelSession;
  readonly helpWindow: HelpWindow;
  readonly pendingOps: readonly PendingOperation[];
  readonly leaderboardSync: LeaderboardSyncState;
}

export interface WordEntryInput {
  readonly id: number;
  readonly bare: string;
  readonly rank: number;
  readonly type: string;
  readonly normalized: string;
}

export interface PendingHelpRequestInput {
  readonly operationId: string;
  readonly kind: HelpKind;
  readonly requestedAt: number;
}

export interface HelpWindowInput {
  readonly windowStartTs: number;
  readonly freeActionAvailable: boolean;
  readonly pendingHelpRequest?: PendingHelpRequestInput | null;
}

export interface PendingOperationInput {
  readonly operationId: string;
  readonly kind: PendingOperationKind;
  readonly status: PendingOperationStatus;
  readonly retryCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface LeaderboardSyncStateInput {
  readonly lastSubmittedScore: number;
  readonly lastAckScore: number;
  readonly lastSubmitTs: number;
}

export interface LevelSessionInput {
  readonly levelId: string;
  readonly grid: readonly string[];
  readonly targetWords: readonly string[];
  readonly foundTargets: readonly string[];
  readonly foundBonuses: readonly string[];
  readonly status: LevelSessionStatus;
  readonly seed: number;
  readonly meta?: Readonly<Record<string, LevelSessionMetaValue>>;
}

export interface GameStateInput {
  readonly schemaVersion?: number;
  readonly stateVersion?: number;
  readonly updatedAt: number;
  readonly allTimeScore: number;
  readonly currentLevelSession: LevelSessionInput;
  readonly helpWindow: HelpWindowInput;
  readonly pendingOps?: readonly PendingOperationInput[];
  readonly leaderboardSync: LeaderboardSyncStateInput;
}

const LEVEL_SESSION_STATUSES: ReadonlySet<LevelSessionStatus> = new Set([
  'active',
  'completed',
  'reshuffling',
]);

const PENDING_OPERATION_KINDS: ReadonlySet<PendingOperationKind> = new Set([
  'help-hint',
  'help-reshuffle',
  'word-success-animation',
  'level-transition',
  'restore-session',
  'leaderboard-sync',
]);

const PENDING_OPERATION_STATUSES: ReadonlySet<PendingOperationStatus> = new Set([
  'pending',
  'applied',
  'failed',
]);

const HELP_KINDS: ReadonlySet<HelpKind> = new Set(['hint', 'reshuffle']);

function parseError(message: string): Error {
  return new Error(`[game-state] ${message}`);
}

function assertRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw parseError(`${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw parseError(`${fieldName} must be a finite number.`);
  }

  return value;
}

function assertNonNegativeNumber(value: unknown, fieldName: string): number {
  const parsed = assertFiniteNumber(value, fieldName);

  if (parsed < 0) {
    throw parseError(`${fieldName} must be >= 0.`);
  }

  return parsed;
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw parseError(`${fieldName} must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw parseError(`${fieldName} must not be empty.`);
  }

  return normalized;
}

function assertStringArray(value: unknown, fieldName: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw parseError(`${fieldName} must be a string array.`);
  }

  return value.map((entry, index) => assertNonEmptyString(entry, `${fieldName}[${index}]`));
}

function assertLiteral<TValue extends string>(
  value: unknown,
  fieldName: string,
  allowedValues: ReadonlySet<TValue>,
): TValue {
  const parsed = assertNonEmptyString(value, fieldName);

  if (!allowedValues.has(parsed as TValue)) {
    throw parseError(
      `${fieldName} must be one of: ${Array.from(allowedValues).sort().join(', ')}.`,
    );
  }

  return parsed as TValue;
}

function assertLevelSessionMeta(
  value: unknown,
  fieldName: string,
): Readonly<Record<string, LevelSessionMetaValue>> {
  if (value === undefined) {
    return {};
  }

  const source = assertRecord(value, fieldName);
  const result: Record<string, LevelSessionMetaValue> = {};

  for (const [key, metaValue] of Object.entries(source)) {
    if (
      metaValue === null ||
      typeof metaValue === 'string' ||
      typeof metaValue === 'number' ||
      typeof metaValue === 'boolean'
    ) {
      result[key] = metaValue;
      continue;
    }

    throw parseError(
      `${fieldName}.${key} must be string, number, boolean, or null to stay JSON-serializable.`,
    );
  }

  return result;
}

export function createWordEntry(input: WordEntryInput): WordEntry {
  return {
    id: assertNonNegativeNumber(input.id, 'wordEntry.id'),
    bare: assertNonEmptyString(input.bare, 'wordEntry.bare'),
    rank: assertFiniteNumber(input.rank, 'wordEntry.rank'),
    type: assertNonEmptyString(input.type, 'wordEntry.type'),
    normalized: assertNonEmptyString(input.normalized, 'wordEntry.normalized'),
  };
}

export function createPendingHelpRequest(input: PendingHelpRequestInput): PendingHelpRequest {
  return {
    operationId: assertNonEmptyString(input.operationId, 'pendingHelpRequest.operationId'),
    kind: assertLiteral(input.kind, 'pendingHelpRequest.kind', HELP_KINDS),
    requestedAt: assertNonNegativeNumber(input.requestedAt, 'pendingHelpRequest.requestedAt'),
  };
}

export function createHelpWindow(input: HelpWindowInput): HelpWindow {
  return {
    windowStartTs: assertNonNegativeNumber(input.windowStartTs, 'helpWindow.windowStartTs'),
    freeActionAvailable:
      typeof input.freeActionAvailable === 'boolean'
        ? input.freeActionAvailable
        : (() => {
            throw parseError('helpWindow.freeActionAvailable must be a boolean.');
          })(),
    pendingHelpRequest:
      input.pendingHelpRequest === undefined || input.pendingHelpRequest === null
        ? null
        : createPendingHelpRequest(input.pendingHelpRequest),
  };
}

export function createPendingOperation(input: PendingOperationInput): PendingOperation {
  return {
    operationId: assertNonEmptyString(input.operationId, 'pendingOperation.operationId'),
    kind: assertLiteral(input.kind, 'pendingOperation.kind', PENDING_OPERATION_KINDS),
    status: assertLiteral(input.status, 'pendingOperation.status', PENDING_OPERATION_STATUSES),
    retryCount: assertNonNegativeNumber(input.retryCount, 'pendingOperation.retryCount'),
    createdAt: assertNonNegativeNumber(input.createdAt, 'pendingOperation.createdAt'),
    updatedAt: assertNonNegativeNumber(input.updatedAt, 'pendingOperation.updatedAt'),
  };
}

export function createLeaderboardSyncState(input: LeaderboardSyncStateInput): LeaderboardSyncState {
  return {
    lastSubmittedScore: assertNonNegativeNumber(
      input.lastSubmittedScore,
      'leaderboardSync.lastSubmittedScore',
    ),
    lastAckScore: assertNonNegativeNumber(input.lastAckScore, 'leaderboardSync.lastAckScore'),
    lastSubmitTs: assertNonNegativeNumber(input.lastSubmitTs, 'leaderboardSync.lastSubmitTs'),
  };
}

export function createLevelSession(input: LevelSessionInput): LevelSession {
  return {
    levelId: assertNonEmptyString(input.levelId, 'levelSession.levelId'),
    grid: assertStringArray(input.grid, 'levelSession.grid'),
    targetWords: assertStringArray(input.targetWords, 'levelSession.targetWords'),
    foundTargets: assertStringArray(input.foundTargets, 'levelSession.foundTargets'),
    foundBonuses: assertStringArray(input.foundBonuses, 'levelSession.foundBonuses'),
    status: assertLiteral(input.status, 'levelSession.status', LEVEL_SESSION_STATUSES),
    seed: assertFiniteNumber(input.seed, 'levelSession.seed'),
    meta: assertLevelSessionMeta(input.meta, 'levelSession.meta'),
  };
}

export function createGameState(input: GameStateInput): GameState {
  return {
    schemaVersion: assertNonNegativeNumber(
      input.schemaVersion ?? GAME_STATE_SCHEMA_VERSION,
      'gameState.schemaVersion',
    ),
    stateVersion: assertNonNegativeNumber(input.stateVersion ?? 0, 'gameState.stateVersion'),
    updatedAt: assertNonNegativeNumber(input.updatedAt, 'gameState.updatedAt'),
    allTimeScore: assertNonNegativeNumber(input.allTimeScore, 'gameState.allTimeScore'),
    currentLevelSession: createLevelSession(input.currentLevelSession),
    helpWindow: createHelpWindow(input.helpWindow),
    pendingOps: (input.pendingOps ?? []).map((operation) => createPendingOperation(operation)),
    leaderboardSync: createLeaderboardSyncState(input.leaderboardSync),
  };
}

function toWordEntryInput(value: unknown): WordEntryInput {
  const source = assertRecord(value, 'wordEntry');

  return {
    id: assertNonNegativeNumber(source.id, 'wordEntry.id'),
    bare: assertNonEmptyString(source.bare, 'wordEntry.bare'),
    rank: assertFiniteNumber(source.rank, 'wordEntry.rank'),
    type: assertNonEmptyString(source.type, 'wordEntry.type'),
    normalized: assertNonEmptyString(source.normalized, 'wordEntry.normalized'),
  };
}

function toPendingHelpRequestInput(value: unknown): PendingHelpRequestInput {
  const source = assertRecord(value, 'pendingHelpRequest');

  return {
    operationId: assertNonEmptyString(source.operationId, 'pendingHelpRequest.operationId'),
    kind: assertLiteral(source.kind, 'pendingHelpRequest.kind', HELP_KINDS),
    requestedAt: assertNonNegativeNumber(source.requestedAt, 'pendingHelpRequest.requestedAt'),
  };
}

function toHelpWindowInput(value: unknown): HelpWindowInput {
  const source = assertRecord(value, 'helpWindow');
  const pendingHelpRequestRaw = source.pendingHelpRequest;
  const pendingHelpRequest =
    pendingHelpRequestRaw === null || pendingHelpRequestRaw === undefined
      ? null
      : toPendingHelpRequestInput(pendingHelpRequestRaw);

  return {
    windowStartTs: assertNonNegativeNumber(source.windowStartTs, 'helpWindow.windowStartTs'),
    freeActionAvailable:
      typeof source.freeActionAvailable === 'boolean'
        ? source.freeActionAvailable
        : (() => {
            throw parseError('helpWindow.freeActionAvailable must be a boolean.');
          })(),
    pendingHelpRequest,
  };
}

function toPendingOperationInput(value: unknown): PendingOperationInput {
  const source = assertRecord(value, 'pendingOperation');

  return {
    operationId: assertNonEmptyString(source.operationId, 'pendingOperation.operationId'),
    kind: assertLiteral(source.kind, 'pendingOperation.kind', PENDING_OPERATION_KINDS),
    status: assertLiteral(source.status, 'pendingOperation.status', PENDING_OPERATION_STATUSES),
    retryCount: assertNonNegativeNumber(source.retryCount, 'pendingOperation.retryCount'),
    createdAt: assertNonNegativeNumber(source.createdAt, 'pendingOperation.createdAt'),
    updatedAt: assertNonNegativeNumber(source.updatedAt, 'pendingOperation.updatedAt'),
  };
}

function toLeaderboardSyncStateInput(value: unknown): LeaderboardSyncStateInput {
  const source = assertRecord(value, 'leaderboardSync');

  return {
    lastSubmittedScore: assertNonNegativeNumber(
      source.lastSubmittedScore,
      'leaderboardSync.lastSubmittedScore',
    ),
    lastAckScore: assertNonNegativeNumber(source.lastAckScore, 'leaderboardSync.lastAckScore'),
    lastSubmitTs: assertNonNegativeNumber(source.lastSubmitTs, 'leaderboardSync.lastSubmitTs'),
  };
}

function toLevelSessionInput(value: unknown): LevelSessionInput {
  const source = assertRecord(value, 'levelSession');

  return {
    levelId: assertNonEmptyString(source.levelId, 'levelSession.levelId'),
    grid: assertStringArray(source.grid, 'levelSession.grid'),
    targetWords: assertStringArray(source.targetWords, 'levelSession.targetWords'),
    foundTargets: assertStringArray(source.foundTargets, 'levelSession.foundTargets'),
    foundBonuses: assertStringArray(source.foundBonuses, 'levelSession.foundBonuses'),
    status: assertLiteral(source.status, 'levelSession.status', LEVEL_SESSION_STATUSES),
    seed: assertFiniteNumber(source.seed, 'levelSession.seed'),
    meta: assertLevelSessionMeta(source.meta, 'levelSession.meta'),
  };
}

function toGameStateInput(value: unknown): GameStateInput {
  const source = assertRecord(value, 'gameState');
  const pendingOpsRaw = source.pendingOps;
  const pendingOps = pendingOpsRaw
    ? (() => {
        if (!Array.isArray(pendingOpsRaw)) {
          throw parseError('gameState.pendingOps must be an array when present.');
        }

        return pendingOpsRaw.map((entry) => toPendingOperationInput(entry));
      })()
    : [];

  return {
    schemaVersion: assertNonNegativeNumber(source.schemaVersion, 'gameState.schemaVersion'),
    stateVersion: assertNonNegativeNumber(source.stateVersion, 'gameState.stateVersion'),
    updatedAt: assertNonNegativeNumber(source.updatedAt, 'gameState.updatedAt'),
    allTimeScore: assertNonNegativeNumber(source.allTimeScore, 'gameState.allTimeScore'),
    currentLevelSession: toLevelSessionInput(source.currentLevelSession),
    helpWindow: toHelpWindowInput(source.helpWindow),
    pendingOps,
    leaderboardSync: toLeaderboardSyncStateInput(source.leaderboardSync),
  };
}

export function serializeWordEntry(entry: WordEntry): string {
  return JSON.stringify(createWordEntry(toWordEntryInput(entry)));
}

export function deserializeWordEntry(serialized: string): WordEntry {
  try {
    return createWordEntry(toWordEntryInput(JSON.parse(serialized) as unknown));
  } catch (error: unknown) {
    throw parseError(`Failed to deserialize WordEntry: ${(error as Error).message}`);
  }
}

export function serializeGameState(state: GameState): string {
  return JSON.stringify(createGameState(toGameStateInput(state)));
}

export function deserializeGameState(serialized: string): GameState {
  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw parseError('Invalid JSON snapshot.');
  }

  return createGameState(toGameStateInput(parsed));
}
