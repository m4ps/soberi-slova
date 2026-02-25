import { toErrorMessage } from '../../shared/errors';
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
const CYRILLIC_WORD_PATTERN = /^[а-яё]+$/u;
const CYRILLIC_GRID_CELL_PATTERN = /^[а-яё]$/u;
const LEGACY_GAME_STATE_SCHEMA_VERSION = 0;

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

  if (!Number.isInteger(parsed)) {
    throw parseError(
      `${fieldName} must be a non-negative integer.`,
      'game-state.migration.integer',
      {
        fieldName,
        value,
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
  if (!CYRILLIC_WORD_PATTERN.test(value)) {
    throw parseError(
      `${fieldName} must contain only lowercase Cyrillic letters (а-я, ё).`,
      'game-state.invariant.cyrillic-word',
      { fieldName, value },
    );
  }

  return value;
}

function assertGridCell(value: string, fieldName: string): string {
  if (!CYRILLIC_GRID_CELL_PATTERN.test(value)) {
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
  if (words.length < LEVEL_TARGET_WORDS_MIN || words.length > LEVEL_TARGET_WORDS_MAX) {
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
    freeActionAvailable: assertBoolean(input.freeActionAvailable, 'helpWindow.freeActionAvailable'),
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

export function createGameState(
  input: GameStateInput,
  options: GameStateCreationOptions = {},
): GameState {
  const nextState: GameState = {
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

  if (options.previousState) {
    assertLevelSessionTransition(
      options.previousState.currentLevelSession,
      nextState.currentLevelSession,
    );
  }

  return nextState;
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
    freeActionAvailable: assertBoolean(
      source.freeActionAvailable,
      'helpWindow.freeActionAvailable',
    ),
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
    grid: assertGrid(source.grid, 'levelSession.grid'),
    targetWords: assertCyrillicWordArray(source.targetWords, 'levelSession.targetWords'),
    foundTargets: assertCyrillicWordArray(source.foundTargets, 'levelSession.foundTargets'),
    foundBonuses: assertCyrillicWordArray(source.foundBonuses, 'levelSession.foundBonuses'),
    status: assertLiteral(source.status, 'levelSession.status', LEVEL_SESSION_STATUSES),
    seed: assertFiniteNumber(source.seed, 'levelSession.seed'),
    meta: assertLevelSessionMeta(source.meta, 'levelSession.meta'),
  };
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
