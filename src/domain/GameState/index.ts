import { toErrorMessage } from '../../shared/errors';
import type { HelpKind } from '../HelpEconomy';
import {
  isLengthInRange,
  isLowercaseCyrillicLetter,
  isLowercaseCyrillicWord,
} from '../data-contract';

export const GAME_STATE_SCHEMA_VERSION = 2;

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

export type WordEntryInput = WordEntry;

export type PendingHelpRequestInput = PendingHelpRequest;

export interface HelpWindowInput extends Omit<HelpWindow, 'pendingHelpRequest'> {
  readonly pendingHelpRequest?: PendingHelpRequestInput | null;
}

export type PendingOperationInput = PendingOperation;

export type LeaderboardSyncStateInput = LeaderboardSyncState;

export interface LevelSessionInput extends Omit<LevelSession, 'meta'> {
  readonly meta?: Readonly<Record<string, LevelSessionMetaValue>>;
}

export interface GameStateInput extends Omit<
  GameState,
  'schemaVersion' | 'stateVersion' | 'currentLevelSession' | 'helpWindow' | 'pendingOps'
> {
  readonly schemaVersion?: number;
  readonly stateVersion?: number;
  readonly currentLevelSession: LevelSessionInput;
  readonly helpWindow: HelpWindowInput;
  readonly pendingOps?: readonly PendingOperationInput[];
}

export interface GameStateCreationOptions {
  readonly previousState?: GameState;
}

export type SnapshotSource = 'local' | 'cloud';
export type SnapshotLwwWinnerReason = 'stateVersion' | 'updatedAt' | 'local-priority';

export interface AppliedSnapshotMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
}

export interface MigrateSnapshotResult {
  readonly state: GameState;
  readonly schemaVersionBefore: number;
  readonly schemaVersionAfter: number;
  readonly appliedMigrations: readonly AppliedSnapshotMigration[];
}

export interface LwwSnapshotResolutionResult {
  readonly winner: SnapshotSource;
  readonly reason: SnapshotLwwWinnerReason;
  readonly resolvedState: GameState;
}

interface SnapshotMigrationStep {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate: (snapshot: Readonly<Record<string, unknown>>) => Record<string, unknown>;
}

export class GameStateDomainError extends Error {
  readonly code: string;
  readonly retryable: false;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, context: Readonly<Record<string, unknown>> = {}) {
    super(`[game-state] ${message}`);
    this.name = 'GameStateDomainError';
    this.code = code;
    this.retryable = false;
    this.context = context;
  }
}

export function isGameStateDomainError(error: unknown): error is GameStateDomainError {
  return error instanceof GameStateDomainError;
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

const LEVEL_GRID_SIDE = 5;
const LEVEL_GRID_CELL_COUNT = LEVEL_GRID_SIDE * LEVEL_GRID_SIDE;
const LEVEL_TARGET_WORDS_MIN = 3;
const LEVEL_TARGET_WORDS_MAX = 7;
const MAX_PENDING_OPERATIONS = 128;
const LEGACY_GAME_STATE_SCHEMA_VERSION = 0;
const DEPRECATED_GAME_STATE_FIELDS_V2 = [
  'sessionScore',
  'achievements',
  'dailyQuests',
  'tutorialTrace',
  'tutorialTraces',
] as const;
const DEPRECATED_LEVEL_SESSION_FIELDS_V2 = [
  'sessionScore',
  'achievements',
  'dailyQuests',
  'tutorialTrace',
  'tutorialTraces',
] as const;
const DEPRECATED_PENDING_HELP_REQUEST_FIELDS_V2 = ['requestedAt'] as const;

function isRecordLike(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function omitFields(
  source: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...source };

  for (const field of fields) {
    delete result[field];
  }

  return result;
}

const SNAPSHOT_MIGRATION_STEPS: readonly SnapshotMigrationStep[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    migrate: (snapshot) => {
      const nextSnapshot: Record<string, unknown> = {
        ...snapshot,
        schemaVersion: 1,
      };

      if (nextSnapshot.stateVersion === undefined || nextSnapshot.stateVersion === null) {
        nextSnapshot.stateVersion = 0;
      }

      if (nextSnapshot.pendingOps === undefined || nextSnapshot.pendingOps === null) {
        nextSnapshot.pendingOps = [];
      }

      return nextSnapshot;
    },
  },
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (snapshot) => {
      const nextSnapshot = omitFields(snapshot, DEPRECATED_GAME_STATE_FIELDS_V2);
      nextSnapshot.schemaVersion = 2;

      if (isRecordLike(nextSnapshot.currentLevelSession)) {
        nextSnapshot.currentLevelSession = omitFields(
          nextSnapshot.currentLevelSession,
          DEPRECATED_LEVEL_SESSION_FIELDS_V2,
        );
      }

      if (isRecordLike(nextSnapshot.helpWindow)) {
        const helpWindow = { ...nextSnapshot.helpWindow };

        if (isRecordLike(helpWindow.pendingHelpRequest)) {
          helpWindow.pendingHelpRequest = omitFields(
            helpWindow.pendingHelpRequest,
            DEPRECATED_PENDING_HELP_REQUEST_FIELDS_V2,
          );
        }

        nextSnapshot.helpWindow = helpWindow;
      }

      return nextSnapshot;
    },
  },
];

const SAME_LEVEL_STATUS_TRANSITIONS: Readonly<
  Record<LevelSessionStatus, readonly LevelSessionStatus[]>
> = {
  active: ['active', 'completed'],
  completed: ['completed', 'reshuffling'],
  reshuffling: ['reshuffling'],
};

function parseError(
  message: string,
  code = 'game-state.validation',
  context: Readonly<Record<string, unknown>> = {},
): GameStateDomainError {
  return new GameStateDomainError(code, message, context);
}

function assertNonNegativeInteger(value: unknown, fieldName: string): number {
  const parsed = assertNonNegativeNumber(value, fieldName);

  if (!Number.isSafeInteger(parsed)) {
    throw parseError(
      `${fieldName} must be a non-negative safe integer.`,
      'game-state.migration.integer',
      {
        fieldName,
        value,
        maxSafeInteger: Number.MAX_SAFE_INTEGER,
      },
    );
  }

  return parsed;
}

function assertNonNegativeSafeInteger(value: unknown, fieldName: string): number {
  const parsed = assertNonNegativeNumber(value, fieldName);

  if (!Number.isSafeInteger(parsed)) {
    throw parseError(
      `${fieldName} must be a non-negative safe integer.`,
      'game-state.validation.safe-integer',
      {
        fieldName,
        value,
        maxSafeInteger: Number.MAX_SAFE_INTEGER,
      },
    );
  }

  return parsed;
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

function assertBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw parseError(`${fieldName} must be a boolean.`);
  }

  return value;
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

function assertCyrillicWord(value: string, fieldName: string): string {
  if (!isLowercaseCyrillicWord(value)) {
    throw parseError(
      `${fieldName} must contain only lowercase Cyrillic letters (а-я, ё).`,
      'game-state.invariant.cyrillic-word',
      { fieldName, value },
    );
  }

  return value;
}

function assertGridCell(value: string, fieldName: string): string {
  if (!isLowercaseCyrillicLetter(value)) {
    throw parseError(
      `${fieldName} must be a single lowercase Cyrillic letter (а-я, ё).`,
      'game-state.invariant.grid-cyrillic',
      { fieldName, value },
    );
  }

  return value;
}

function assertCyrillicWordArray(value: unknown, fieldName: string): readonly string[] {
  return assertStringArray(value, fieldName).map((entry, index) =>
    assertCyrillicWord(entry, `${fieldName}[${index}]`),
  );
}

function assertGrid(value: unknown, fieldName: string): readonly string[] {
  const grid = assertStringArray(value, fieldName);

  if (grid.length !== LEVEL_GRID_CELL_COUNT) {
    throw parseError(
      `${fieldName} must contain exactly ${LEVEL_GRID_CELL_COUNT} cells (${LEVEL_GRID_SIDE}x${LEVEL_GRID_SIDE}).`,
      'game-state.invariant.grid-size',
      {
        expected: LEVEL_GRID_CELL_COUNT,
        actual: grid.length,
      },
    );
  }

  return grid.map((entry, index) => assertGridCell(entry, `${fieldName}[${index}]`));
}

function assertUniqueWords(words: readonly string[], fieldName: string): void {
  const seen = new Set<string>();

  for (const [index, word] of words.entries()) {
    if (seen.has(word)) {
      throw parseError(
        `${fieldName} must not contain duplicate values.`,
        'game-state.invariant.duplicate-word',
        { fieldName, word, index },
      );
    }

    seen.add(word);
  }
}

function assertTargetWordCount(words: readonly string[]): void {
  if (!isLengthInRange(words.length, LEVEL_TARGET_WORDS_MIN, LEVEL_TARGET_WORDS_MAX)) {
    throw parseError(
      `levelSession.targetWords must contain from ${LEVEL_TARGET_WORDS_MIN} to ${LEVEL_TARGET_WORDS_MAX} words.`,
      'game-state.invariant.target-count',
      {
        min: LEVEL_TARGET_WORDS_MIN,
        max: LEVEL_TARGET_WORDS_MAX,
        actual: words.length,
      },
    );
  }
}

function assertFoundTargetsBelongToTargetWords(
  targetWords: readonly string[],
  foundTargets: readonly string[],
): void {
  const targetWordsSet = new Set(targetWords);

  for (const word of foundTargets) {
    if (!targetWordsSet.has(word)) {
      throw parseError(
        'levelSession.foundTargets must contain only words from levelSession.targetWords.',
        'game-state.invariant.found-target-not-target',
        { word },
      );
    }
  }
}

function assertFoundBonusesDoNotContainTargetWords(
  targetWords: readonly string[],
  foundBonuses: readonly string[],
): void {
  const targetWordsSet = new Set(targetWords);

  for (const word of foundBonuses) {
    if (targetWordsSet.has(word)) {
      throw parseError(
        'levelSession.foundBonuses must not contain target words.',
        'game-state.invariant.bonus-is-target',
        { word },
      );
    }
  }
}

function assertFoundSetsDoNotIntersect(
  foundTargets: readonly string[],
  foundBonuses: readonly string[],
): void {
  const foundTargetSet = new Set(foundTargets);

  for (const word of foundBonuses) {
    if (foundTargetSet.has(word)) {
      throw parseError(
        'levelSession.foundTargets and levelSession.foundBonuses must not intersect.',
        'game-state.invariant.found-sets-overlap',
        { word },
      );
    }
  }
}

function assertNoWordRegression(
  previousWords: readonly string[],
  nextWords: readonly string[],
  fieldName: string,
  code: string,
): void {
  const nextWordsSet = new Set(nextWords);

  for (const word of previousWords) {
    if (!nextWordsSet.has(word)) {
      throw parseError(
        `${fieldName} must not lose previously found words within the same level.`,
        code,
        { fieldName, word },
      );
    }
  }
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

function assertPendingOperationTimeline(operation: PendingOperation): void {
  if (operation.updatedAt < operation.createdAt) {
    throw parseError(
      'pendingOperation.updatedAt must be >= pendingOperation.createdAt.',
      'game-state.invariant.pending-operation-timeline',
      {
        operationId: operation.operationId,
        createdAt: operation.createdAt,
        updatedAt: operation.updatedAt,
      },
    );
  }
}

function assertPendingOperationsLimit(pendingOps: readonly PendingOperation[]): void {
  if (pendingOps.length > MAX_PENDING_OPERATIONS) {
    throw parseError(
      `gameState.pendingOps must contain at most ${MAX_PENDING_OPERATIONS} operations.`,
      'game-state.invariant.pending-operations-limit',
      {
        max: MAX_PENDING_OPERATIONS,
        actual: pendingOps.length,
      },
    );
  }
}

function assertUniquePendingOperationIds(pendingOps: readonly PendingOperation[]): void {
  const seenOperationIds = new Set<string>();

  for (const operation of pendingOps) {
    if (seenOperationIds.has(operation.operationId)) {
      throw parseError(
        'gameState.pendingOps must not contain duplicate operationId values.',
        'game-state.invariant.pending-operation-duplicate-id',
        { operationId: operation.operationId },
      );
    }

    seenOperationIds.add(operation.operationId);
  }
}

function assertLeaderboardSyncConsistency(
  leaderboardSync: LeaderboardSyncState,
  allTimeScore: number,
): void {
  if (leaderboardSync.lastAckScore > leaderboardSync.lastSubmittedScore) {
    throw parseError(
      'leaderboardSync.lastAckScore must be <= leaderboardSync.lastSubmittedScore.',
      'game-state.invariant.leaderboard-ack-order',
      {
        lastAckScore: leaderboardSync.lastAckScore,
        lastSubmittedScore: leaderboardSync.lastSubmittedScore,
      },
    );
  }

  if (leaderboardSync.lastSubmittedScore > allTimeScore) {
    throw parseError(
      'leaderboardSync.lastSubmittedScore must be <= gameState.allTimeScore.',
      'game-state.invariant.leaderboard-submitted-score',
      {
        lastSubmittedScore: leaderboardSync.lastSubmittedScore,
        allTimeScore,
      },
    );
  }

  if (leaderboardSync.lastSubmittedScore === 0 && leaderboardSync.lastSubmitTs !== 0) {
    throw parseError(
      'leaderboardSync.lastSubmitTs must be 0 when no score has been submitted.',
      'game-state.invariant.leaderboard-submit-timestamp',
      {
        lastSubmittedScore: leaderboardSync.lastSubmittedScore,
        lastSubmitTs: leaderboardSync.lastSubmitTs,
      },
    );
  }
}

export function createWordEntry(input: WordEntryInput): WordEntry {
  return {
    id: assertNonNegativeSafeInteger(input.id, 'wordEntry.id'),
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
  };
}

export function createHelpWindow(input: HelpWindowInput): HelpWindow {
  return {
    windowStartTs: assertNonNegativeSafeInteger(input.windowStartTs, 'helpWindow.windowStartTs'),
    freeActionAvailable: assertBoolean(input.freeActionAvailable, 'helpWindow.freeActionAvailable'),
    pendingHelpRequest:
      input.pendingHelpRequest === undefined || input.pendingHelpRequest === null
        ? null
        : createPendingHelpRequest(input.pendingHelpRequest),
  };
}

export function createPendingOperation(input: PendingOperationInput): PendingOperation {
  const operation: PendingOperation = {
    operationId: assertNonEmptyString(input.operationId, 'pendingOperation.operationId'),
    kind: assertLiteral(input.kind, 'pendingOperation.kind', PENDING_OPERATION_KINDS),
    status: assertLiteral(input.status, 'pendingOperation.status', PENDING_OPERATION_STATUSES),
    retryCount: assertNonNegativeSafeInteger(input.retryCount, 'pendingOperation.retryCount'),
    createdAt: assertNonNegativeSafeInteger(input.createdAt, 'pendingOperation.createdAt'),
    updatedAt: assertNonNegativeSafeInteger(input.updatedAt, 'pendingOperation.updatedAt'),
  };

  assertPendingOperationTimeline(operation);

  return operation;
}

export function createLeaderboardSyncState(input: LeaderboardSyncStateInput): LeaderboardSyncState {
  return {
    lastSubmittedScore: assertNonNegativeSafeInteger(
      input.lastSubmittedScore,
      'leaderboardSync.lastSubmittedScore',
    ),
    lastAckScore: assertNonNegativeSafeInteger(input.lastAckScore, 'leaderboardSync.lastAckScore'),
    lastSubmitTs: assertNonNegativeSafeInteger(input.lastSubmitTs, 'leaderboardSync.lastSubmitTs'),
  };
}

export function createLevelSession(input: LevelSessionInput): LevelSession {
  const levelSession: LevelSession = {
    levelId: assertNonEmptyString(input.levelId, 'levelSession.levelId'),
    grid: assertGrid(input.grid, 'levelSession.grid'),
    targetWords: assertCyrillicWordArray(input.targetWords, 'levelSession.targetWords'),
    foundTargets: assertCyrillicWordArray(input.foundTargets, 'levelSession.foundTargets'),
    foundBonuses: assertCyrillicWordArray(input.foundBonuses, 'levelSession.foundBonuses'),
    status: assertLiteral(input.status, 'levelSession.status', LEVEL_SESSION_STATUSES),
    seed: assertFiniteNumber(input.seed, 'levelSession.seed'),
    meta: assertLevelSessionMeta(input.meta, 'levelSession.meta'),
  };

  assertTargetWordCount(levelSession.targetWords);
  assertUniqueWords(levelSession.targetWords, 'levelSession.targetWords');
  assertUniqueWords(levelSession.foundTargets, 'levelSession.foundTargets');
  assertUniqueWords(levelSession.foundBonuses, 'levelSession.foundBonuses');
  assertFoundTargetsBelongToTargetWords(levelSession.targetWords, levelSession.foundTargets);
  assertFoundSetsDoNotIntersect(levelSession.foundTargets, levelSession.foundBonuses);
  assertFoundBonusesDoNotContainTargetWords(levelSession.targetWords, levelSession.foundBonuses);

  return levelSession;
}

export function assertLevelSessionTransition(
  previousSession: LevelSession,
  nextSession: LevelSession,
): void {
  const levelChanged = previousSession.levelId !== nextSession.levelId;

  if (!levelChanged) {
    const allowedTransitions = SAME_LEVEL_STATUS_TRANSITIONS[previousSession.status];

    if (!allowedTransitions.includes(nextSession.status)) {
      throw parseError(
        `Invalid level status transition: ${previousSession.status} -> ${nextSession.status}.`,
        'game-state.invariant.level-status-transition',
        {
          fromStatus: previousSession.status,
          toStatus: nextSession.status,
          levelId: previousSession.levelId,
        },
      );
    }

    assertNoWordRegression(
      previousSession.foundTargets,
      nextSession.foundTargets,
      'levelSession.foundTargets',
      'game-state.invariant.found-targets-regression',
    );
    assertNoWordRegression(
      previousSession.foundBonuses,
      nextSession.foundBonuses,
      'levelSession.foundBonuses',
      'game-state.invariant.found-bonuses-regression',
    );

    return;
  }

  const isAllowedNextLevelTransition =
    previousSession.status === 'reshuffling' && nextSession.status === 'active';

  if (!isAllowedNextLevelTransition) {
    throw parseError(
      'levelSession.levelId can change only during reshuffling -> active transition.',
      'game-state.invariant.level-transition-order',
      {
        fromStatus: previousSession.status,
        toStatus: nextSession.status,
        previousLevelId: previousSession.levelId,
        nextLevelId: nextSession.levelId,
      },
    );
  }
}

function assertGameStateProgression(previousState: GameState, nextState: GameState): void {
  if (nextState.stateVersion < previousState.stateVersion) {
    throw parseError(
      'gameState.stateVersion must not decrease between consecutive states.',
      'game-state.invariant.state-version-regression',
      {
        previousStateVersion: previousState.stateVersion,
        nextStateVersion: nextState.stateVersion,
      },
    );
  }

  if (nextState.updatedAt < previousState.updatedAt) {
    throw parseError(
      'gameState.updatedAt must not decrease between consecutive states.',
      'game-state.invariant.updated-at-regression',
      {
        previousUpdatedAt: previousState.updatedAt,
        nextUpdatedAt: nextState.updatedAt,
      },
    );
  }

  if (nextState.allTimeScore < previousState.allTimeScore) {
    throw parseError(
      'gameState.allTimeScore must not decrease between consecutive states.',
      'game-state.invariant.score-regression',
      {
        previousAllTimeScore: previousState.allTimeScore,
        nextAllTimeScore: nextState.allTimeScore,
      },
    );
  }
}

export function createGameState(
  input: GameStateInput,
  options: GameStateCreationOptions = {},
): GameState {
  const nextState: GameState = {
    schemaVersion: assertNonNegativeSafeInteger(
      input.schemaVersion ?? GAME_STATE_SCHEMA_VERSION,
      'gameState.schemaVersion',
    ),
    stateVersion: assertNonNegativeSafeInteger(input.stateVersion ?? 0, 'gameState.stateVersion'),
    updatedAt: assertNonNegativeSafeInteger(input.updatedAt, 'gameState.updatedAt'),
    allTimeScore: assertNonNegativeSafeInteger(input.allTimeScore, 'gameState.allTimeScore'),
    currentLevelSession: createLevelSession(input.currentLevelSession),
    helpWindow: createHelpWindow(input.helpWindow),
    pendingOps: (input.pendingOps ?? []).map((operation) => createPendingOperation(operation)),
    leaderboardSync: createLeaderboardSyncState(input.leaderboardSync),
  };

  assertPendingOperationsLimit(nextState.pendingOps);
  assertUniquePendingOperationIds(nextState.pendingOps);
  assertLeaderboardSyncConsistency(nextState.leaderboardSync, nextState.allTimeScore);

  if (options.previousState) {
    assertGameStateProgression(options.previousState, nextState);
    assertLevelSessionTransition(
      options.previousState.currentLevelSession,
      nextState.currentLevelSession,
    );
  }

  return nextState;
}

function toWordEntryInput(value: unknown): WordEntryInput {
  return createWordEntry(assertRecord(value, 'wordEntry') as unknown as WordEntryInput);
}

function toHelpWindowInput(value: unknown): HelpWindowInput {
  return createHelpWindow(assertRecord(value, 'helpWindow') as unknown as HelpWindowInput);
}

function toPendingOperationInput(value: unknown): PendingOperationInput {
  return createPendingOperation(
    assertRecord(value, 'pendingOperation') as unknown as PendingOperationInput,
  );
}

function toLeaderboardSyncStateInput(value: unknown): LeaderboardSyncStateInput {
  return createLeaderboardSyncState(
    assertRecord(value, 'leaderboardSync') as unknown as LeaderboardSyncStateInput,
  );
}

function toLevelSessionInput(value: unknown): LevelSessionInput {
  return createLevelSession(assertRecord(value, 'levelSession') as unknown as LevelSessionInput);
}

function toGameStateInput(value: unknown): GameStateInput {
  const source = assertRecord(value, 'gameState');
  const pendingOpsRaw = source.pendingOps;
  const pendingOps =
    pendingOpsRaw === undefined || pendingOpsRaw === null
      ? []
      : (() => {
          if (!Array.isArray(pendingOpsRaw)) {
            throw parseError('gameState.pendingOps must be an array when present.');
          }

          return pendingOpsRaw.map((entry) => toPendingOperationInput(entry));
        })();

  return {
    schemaVersion: assertNonNegativeSafeInteger(source.schemaVersion, 'gameState.schemaVersion'),
    stateVersion: assertNonNegativeSafeInteger(source.stateVersion, 'gameState.stateVersion'),
    updatedAt: assertNonNegativeSafeInteger(source.updatedAt, 'gameState.updatedAt'),
    allTimeScore: assertNonNegativeSafeInteger(source.allTimeScore, 'gameState.allTimeScore'),
    currentLevelSession: toLevelSessionInput(source.currentLevelSession),
    helpWindow: toHelpWindowInput(source.helpWindow),
    pendingOps,
    leaderboardSync: toLeaderboardSyncStateInput(source.leaderboardSync),
  };
}

function getSnapshotSchemaVersion(snapshot: Readonly<Record<string, unknown>>): number {
  if (snapshot.schemaVersion === undefined || snapshot.schemaVersion === null) {
    return LEGACY_GAME_STATE_SCHEMA_VERSION;
  }

  return assertNonNegativeInteger(snapshot.schemaVersion, 'gameState.schemaVersion');
}

function findSnapshotMigrationStep(fromVersion: number): SnapshotMigrationStep | undefined {
  return SNAPSHOT_MIGRATION_STEPS.find((step) => step.fromVersion === fromVersion);
}

function applySnapshotMigrations(
  snapshot: Readonly<Record<string, unknown>>,
): MigrateSnapshotResult {
  const schemaVersionBefore = getSnapshotSchemaVersion(snapshot);

  if (schemaVersionBefore > GAME_STATE_SCHEMA_VERSION) {
    throw parseError(
      `Snapshot schema version ${schemaVersionBefore} is newer than supported version ${GAME_STATE_SCHEMA_VERSION}.`,
      'game-state.migration.unsupported-schema-version',
      {
        schemaVersionBefore,
        supportedSchemaVersion: GAME_STATE_SCHEMA_VERSION,
      },
    );
  }

  if (schemaVersionBefore < LEGACY_GAME_STATE_SCHEMA_VERSION) {
    throw parseError(
      `Snapshot schema version ${schemaVersionBefore} is below supported minimum ${LEGACY_GAME_STATE_SCHEMA_VERSION}.`,
      'game-state.migration.unsupported-legacy-version',
      {
        schemaVersionBefore,
        minSupportedSchemaVersion: LEGACY_GAME_STATE_SCHEMA_VERSION,
      },
    );
  }

  let currentVersion = schemaVersionBefore;
  let currentSnapshot: Record<string, unknown> = { ...snapshot };
  const appliedMigrations: AppliedSnapshotMigration[] = [];

  while (currentVersion < GAME_STATE_SCHEMA_VERSION) {
    const migrationStep = findSnapshotMigrationStep(currentVersion);

    if (!migrationStep || migrationStep.toVersion !== currentVersion + 1) {
      throw parseError(
        `Missing deterministic snapshot migration step ${currentVersion} -> ${currentVersion + 1}.`,
        'game-state.migration.missing-step',
        {
          currentVersion,
          expectedNextVersion: currentVersion + 1,
        },
      );
    }

    currentSnapshot = migrationStep.migrate(currentSnapshot);
    const migratedVersion = getSnapshotSchemaVersion(currentSnapshot);

    if (migratedVersion !== migrationStep.toVersion) {
      throw parseError(
        `Snapshot migration ${migrationStep.fromVersion} -> ${migrationStep.toVersion} produced schema version ${migratedVersion}.`,
        'game-state.migration.invalid-step-result',
        {
          fromVersion: migrationStep.fromVersion,
          toVersion: migrationStep.toVersion,
          actualVersion: migratedVersion,
        },
      );
    }

    appliedMigrations.push({
      fromVersion: migrationStep.fromVersion,
      toVersion: migrationStep.toVersion,
    });
    currentVersion = migratedVersion;
  }

  const state = createGameState(toGameStateInput(currentSnapshot));

  return {
    state,
    schemaVersionBefore,
    schemaVersionAfter: state.schemaVersion,
    appliedMigrations,
  };
}

function resolveSnapshotCandidate(snapshot: GameState | string, source: SnapshotSource): GameState {
  if (typeof snapshot === 'string') {
    try {
      return deserializeGameState(snapshot);
    } catch (error: unknown) {
      throw parseError(
        `Failed to deserialize ${source} snapshot: ${toErrorMessage(error)}.`,
        'game-state.merge.invalid-snapshot',
        { source },
      );
    }
  }

  try {
    return createGameState(toGameStateInput(snapshot));
  } catch (error: unknown) {
    throw parseError(
      `Failed to normalize ${source} snapshot: ${toErrorMessage(error)}.`,
      'game-state.merge.invalid-snapshot',
      { source },
    );
  }
}

export function serializeWordEntry(entry: WordEntry): string {
  return JSON.stringify(createWordEntry(toWordEntryInput(entry)));
}

export function deserializeWordEntry(serialized: string): WordEntry {
  try {
    return createWordEntry(toWordEntryInput(JSON.parse(serialized) as unknown));
  } catch (error: unknown) {
    throw parseError(`Failed to deserialize WordEntry: ${toErrorMessage(error)}`);
  }
}

export function serializeGameState(state: GameState): string {
  return JSON.stringify(createGameState(toGameStateInput(state)));
}

export function migrateGameStateSnapshot(snapshot: unknown): MigrateSnapshotResult {
  const source = assertRecord(snapshot, 'gameState');

  return applySnapshotMigrations(source);
}

export function deserializeGameStateWithMigrations(serialized: string): MigrateSnapshotResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw parseError('Invalid JSON snapshot.', 'game-state.invalid-json');
  }

  return migrateGameStateSnapshot(parsed);
}

export function deserializeGameState(serialized: string): GameState {
  return deserializeGameStateWithMigrations(serialized).state;
}

export function resolveLwwSnapshot(
  localSnapshot: GameState | string,
  cloudSnapshot: GameState | string,
): LwwSnapshotResolutionResult {
  const localState = resolveSnapshotCandidate(localSnapshot, 'local');
  const cloudState = resolveSnapshotCandidate(cloudSnapshot, 'cloud');

  if (localState.stateVersion > cloudState.stateVersion) {
    return {
      winner: 'local',
      reason: 'stateVersion',
      resolvedState: localState,
    };
  }

  if (cloudState.stateVersion > localState.stateVersion) {
    return {
      winner: 'cloud',
      reason: 'stateVersion',
      resolvedState: cloudState,
    };
  }

  if (localState.updatedAt > cloudState.updatedAt) {
    return {
      winner: 'local',
      reason: 'updatedAt',
      resolvedState: localState,
    };
  }

  if (cloudState.updatedAt > localState.updatedAt) {
    return {
      winner: 'cloud',
      reason: 'updatedAt',
      resolvedState: cloudState,
    };
  }

  return {
    winner: 'local',
    reason: 'local-priority',
    resolvedState: localState,
  };
}
