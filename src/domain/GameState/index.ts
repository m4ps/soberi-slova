import { toErrorMessage } from '../../shared/errors';
import {
  HINT_META_REVEAL_COUNT_KEY,
  HINT_META_TARGET_WORD_KEY,
  WORD_GRID_CELL_COUNT,
  WORD_GRID_SIDE,
  findWordPathInGrid,
  sortWordsByDifficulty,
} from '../../shared/word-grid';
import { HELP_WINDOW_DURATION_MS, type HelpKind } from '../HelpEconomy';
import {
  isLengthInRange,
  isLowercaseCyrillicLetter,
  isLowercaseCyrillicWord,
} from '../data-contract';

const SNAPSHOT_SCHEMA_VERSION_V0 = 0;
const SNAPSHOT_SCHEMA_VERSION_V1 = 1;
const SNAPSHOT_SCHEMA_VERSION_V2 = 2;
const SNAPSHOT_SCHEMA_VERSION_V3 = 3;
const SNAPSHOT_SCHEMA_VERSION_V4 = 4;
const DEFAULT_STATE_VERSION = 0;
const LEADERBOARD_EMPTY_SCORE = 0;
const LEADERBOARD_EMPTY_SUBMIT_TS = 0;
const MIGRATION_VERSION_STEP = 1;

export const GAME_STATE_SCHEMA_VERSION = SNAPSHOT_SCHEMA_VERSION_V4;

export type LevelSessionStatus = 'active' | 'completed' | 'reshuffling';

export type PendingOperationKind =
  | 'help-hint'
  | 'help-reshuffle'
  | 'word-success-animation'
  | 'level-transition'
  | 'restore-session'
  | 'leaderboard-sync';

export type PendingOperationStatus = 'pending' | 'applied' | 'failed';
export type HelpLockReason = 'pending-request' | 'cooldown' | 'legacy-free-window';

export interface WordEntry {
  readonly id: number;
  readonly bare: string;
  readonly rank: number;
  readonly type: string;
  readonly normalized: string;
}

export type TargetWordId = string;

export interface PendingHelpRequest {
  readonly operationId: string;
  readonly kind: HelpKind;
}

export interface HelpWindow {
  readonly windowStartTs: number;
  readonly freeActionAvailable: boolean;
  readonly pendingHelpRequest: PendingHelpRequest | null;
}

export interface HelpLockState {
  readonly isLocked: boolean;
  readonly lockedUntil: number | null;
  readonly reason: HelpLockReason | null;
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

export interface WordMixStats {
  readonly short: number;
  readonly medium: number;
  readonly long: number;
}

export interface WordMixBounds {
  readonly min: number;
  readonly max: number;
}

export interface LevelGeneratorScaffold {
  readonly longWordQuota: number;
  readonly wordMixBounds: Readonly<Record<keyof WordMixStats, WordMixBounds>>;
}

export interface DisplayedTargetReadabilityInspection {
  readonly displayedTargetId: TargetWordId;
  readonly path: readonly Readonly<{ readonly row: number; readonly col: number }>[] | null;
  readonly turnCount: number | null;
  readonly maxTurnCount: number;
}

export interface LevelSession {
  readonly levelId: string;
  readonly grid: readonly string[];
  readonly targetWords: readonly string[];
  readonly foundTargets: readonly string[];
  readonly foundBonuses: readonly string[];
  readonly status: LevelSessionStatus;
  readonly seed: number;
  readonly readabilityScore: number;
  readonly wordMixStats: WordMixStats;
}

export interface GameState {
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly updatedAt: number;
  readonly allTimeScore: number;
  readonly currentDisplayedTargetId: TargetWordId | null;
  readonly currentHintPathProgress: number;
  readonly currentLevelSession: LevelSession;
  readonly helpLockState: HelpLockState;
  readonly pendingOps: readonly PendingOperation[];
  readonly leaderboardSync: LeaderboardSyncState;
}

export type WordEntryInput = WordEntry;

export type PendingHelpRequestInput = PendingHelpRequest;
export type HelpLockStateInput = HelpLockState;
export type WordMixStatsInput = WordMixStats;

export interface HelpWindowInput extends Omit<HelpWindow, 'pendingHelpRequest'> {
  readonly pendingHelpRequest?: PendingHelpRequestInput | null;
}

export type PendingOperationInput = PendingOperation;

export type LeaderboardSyncStateInput = LeaderboardSyncState;

export interface LevelSessionInput extends Omit<LevelSession, 'wordMixStats' | 'readabilityScore'> {
  readonly readabilityScore?: number;
  readonly wordMixStats?: WordMixStatsInput;
  readonly meta?: Readonly<Record<string, LevelSessionMetaValue>>;
}

export interface GameStateInput extends Omit<
  GameState,
  | 'schemaVersion'
  | 'stateVersion'
  | 'currentDisplayedTargetId'
  | 'currentHintPathProgress'
  | 'currentLevelSession'
  | 'helpLockState'
  | 'pendingOps'
> {
  readonly schemaVersion?: number;
  readonly stateVersion?: number;
  readonly currentDisplayedTargetId?: TargetWordId | null;
  readonly currentHintPathProgress?: number;
  readonly currentLevelSession: LevelSessionInput;
  readonly helpLockState?: HelpLockStateInput;
  readonly helpWindow?: HelpWindowInput;
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
const HELP_LOCK_REASONS: ReadonlySet<HelpLockReason> = new Set([
  'pending-request',
  'cooldown',
  'legacy-free-window',
]);

const LEGACY_LEVEL_GRID_SIDE = 5;
const LEGACY_LEVEL_GRID_CELL_COUNT = LEGACY_LEVEL_GRID_SIDE * LEGACY_LEVEL_GRID_SIDE;
const LEVEL_GRID_SIDE = WORD_GRID_SIDE;
const LEVEL_GRID_CELL_COUNT = WORD_GRID_CELL_COUNT;
const LEVEL_TARGET_WORDS_MIN = 10;
const LEVEL_TARGET_WORDS_MAX = 15;
const SHORT_WORD_MAX_LENGTH = 4;
const READABLE_TARGET_WORD_MAX_LENGTH = 6;
const LONG_WORD_MIN_LENGTH = 7;
const MAX_LEVEL_READABILITY_SCORE = READABLE_TARGET_WORD_MAX_LENGTH;
const SHORT_WORD_MIX_TARGET_RATIO = 0.35;
const MEDIUM_WORD_MIX_TARGET_RATIO = 0.35;
const LONG_WORD_MIX_TARGET_RATIO = 0.3;
const WORD_MIX_CATEGORY_TOLERANCE = 1;
const MAX_SHORT_WORD_ADVANTAGE = 1;
const MAX_PENDING_OPERATIONS = 128;
const LEGACY_GRID_FILLER_LETTERS = ['ц', 'ш', 'щ', 'ф', 'х', 'ч', 'з', 'э', 'ю', 'й', 'ы'] as const;

function migrateLegacyGridSnapshot(gridCandidate: unknown): unknown {
  if (!Array.isArray(gridCandidate) || gridCandidate.length !== LEGACY_LEVEL_GRID_CELL_COUNT) {
    return gridCandidate;
  }

  const nextGrid: unknown[] = [];
  let fillerIndex = 0;

  for (let row = 0; row < LEGACY_LEVEL_GRID_SIDE; row += 1) {
    const rowStart = row * LEGACY_LEVEL_GRID_SIDE;
    nextGrid.push(...gridCandidate.slice(rowStart, rowStart + LEGACY_LEVEL_GRID_SIDE));
    nextGrid.push(LEGACY_GRID_FILLER_LETTERS[fillerIndex % LEGACY_GRID_FILLER_LETTERS.length]);
    fillerIndex += 1;
  }

  while (nextGrid.length < LEVEL_GRID_CELL_COUNT) {
    nextGrid.push(LEGACY_GRID_FILLER_LETTERS[fillerIndex % LEGACY_GRID_FILLER_LETTERS.length]);
    fillerIndex += 1;
  }

  return nextGrid;
}

function deriveLegacyHelpLockStateSnapshot(
  helpWindowCandidate: unknown,
): Record<string, unknown> | undefined {
  if (
    !helpWindowCandidate ||
    typeof helpWindowCandidate !== 'object' ||
    Array.isArray(helpWindowCandidate)
  ) {
    return undefined;
  }

  const helpWindow = helpWindowCandidate as Record<string, unknown>;
  const pendingHelpRequest = helpWindow.pendingHelpRequest;
  if (
    pendingHelpRequest &&
    typeof pendingHelpRequest === 'object' &&
    !Array.isArray(pendingHelpRequest)
  ) {
    return {
      isLocked: true,
      lockedUntil: null,
      reason: 'pending-request',
    };
  }

  if (helpWindow.freeActionAvailable === false) {
    const windowStartTs = helpWindow.windowStartTs;
    const lockedUntil =
      typeof windowStartTs === 'number' && Number.isFinite(windowStartTs)
        ? Math.max(0, Math.trunc(windowStartTs)) + HELP_WINDOW_DURATION_MS
        : null;

    return {
      isLocked: true,
      lockedUntil,
      reason: 'legacy-free-window',
    };
  }

  return {
    isLocked: false,
    lockedUntil: null,
    reason: null,
  };
}

// Migration chain must stay deterministic and stepwise: vN -> vN+1 only.
const SNAPSHOT_MIGRATION_STEPS: readonly SnapshotMigrationStep[] = [
  {
    fromVersion: SNAPSHOT_SCHEMA_VERSION_V0,
    toVersion: SNAPSHOT_SCHEMA_VERSION_V1,
    migrate: (snapshot) => {
      const nextSnapshot: Record<string, unknown> = {
        ...snapshot,
        schemaVersion: SNAPSHOT_SCHEMA_VERSION_V1,
      };

      if (nextSnapshot.stateVersion === undefined || nextSnapshot.stateVersion === null) {
        nextSnapshot.stateVersion = DEFAULT_STATE_VERSION;
      }

      if (nextSnapshot.pendingOps === undefined || nextSnapshot.pendingOps === null) {
        nextSnapshot.pendingOps = [];
      }

      return nextSnapshot;
    },
  },
  {
    fromVersion: SNAPSHOT_SCHEMA_VERSION_V1,
    toVersion: SNAPSHOT_SCHEMA_VERSION_V2,
    migrate: (snapshot) => ({
      ...snapshot,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION_V2,
    }),
  },
  {
    fromVersion: SNAPSHOT_SCHEMA_VERSION_V2,
    toVersion: SNAPSHOT_SCHEMA_VERSION_V3,
    migrate: (snapshot) => {
      const nextSnapshot: Record<string, unknown> = {
        ...snapshot,
        schemaVersion: SNAPSHOT_SCHEMA_VERSION_V3,
      };

      if (nextSnapshot.currentDisplayedTargetId === undefined) {
        const levelSession = snapshot.currentLevelSession;
        if (levelSession && typeof levelSession === 'object' && !Array.isArray(levelSession)) {
          const meta = (levelSession as Record<string, unknown>).meta;
          if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
            const hintTargetWord = (meta as Record<string, unknown>)[HINT_META_TARGET_WORD_KEY];
            if (typeof hintTargetWord === 'string' && hintTargetWord.trim().length > 0) {
              nextSnapshot.currentDisplayedTargetId = hintTargetWord.trim();
            }
          }
        }
      }

      if (nextSnapshot.currentHintPathProgress === undefined) {
        const levelSession = snapshot.currentLevelSession;
        if (levelSession && typeof levelSession === 'object' && !Array.isArray(levelSession)) {
          const meta = (levelSession as Record<string, unknown>).meta;
          if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
            const hintRevealCount = (meta as Record<string, unknown>)[HINT_META_REVEAL_COUNT_KEY];
            if (
              typeof hintRevealCount === 'number' &&
              Number.isFinite(hintRevealCount) &&
              Number.isSafeInteger(hintRevealCount) &&
              hintRevealCount >= 0
            ) {
              nextSnapshot.currentHintPathProgress = hintRevealCount;
            }
          }
        }
      }

      return nextSnapshot;
    },
  },
  {
    fromVersion: SNAPSHOT_SCHEMA_VERSION_V3,
    toVersion: SNAPSHOT_SCHEMA_VERSION_V4,
    migrate: (snapshot) => {
      const nextSnapshot: Record<string, unknown> = {
        ...snapshot,
        schemaVersion: SNAPSHOT_SCHEMA_VERSION_V4,
      };

      const levelSession = snapshot.currentLevelSession;
      if (levelSession && typeof levelSession === 'object' && !Array.isArray(levelSession)) {
        const legacyLevelSession = levelSession as Record<string, unknown>;
        nextSnapshot.currentLevelSession = {
          ...legacyLevelSession,
          grid: migrateLegacyGridSnapshot(legacyLevelSession.grid),
        };
      }

      if (nextSnapshot.helpLockState === undefined) {
        const helpLockState = deriveLegacyHelpLockStateSnapshot(snapshot.helpWindow);
        if (helpLockState) {
          nextSnapshot.helpLockState = helpLockState;
        }
      }

      return nextSnapshot;
    },
  },
];

const SAME_LEVEL_STATUS_TRANSITIONS: Readonly<
  Record<LevelSessionStatus, readonly LevelSessionStatus[]>
> = {
  active: ['active', 'completed', 'reshuffling'],
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

function assertNullableNonNegativeSafeInteger(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return assertNonNegativeSafeInteger(value, fieldName);
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

function categorizeWordLength(word: string): keyof WordMixStats {
  if (word.length >= LONG_WORD_MIN_LENGTH) {
    return 'long';
  }

  if (word.length <= SHORT_WORD_MAX_LENGTH) {
    return 'short';
  }

  return 'medium';
}

export function calculateWordMixStats(targetWords: readonly string[]): WordMixStats {
  return targetWords.reduce<WordMixStats>(
    (stats, targetWord) => {
      const category = categorizeWordLength(targetWord);
      return {
        ...stats,
        [category]: stats[category] + 1,
      };
    },
    {
      short: 0,
      medium: 0,
      long: 0,
    },
  );
}

function assertWordMixStatsMatchesTargetWords(
  wordMixStats: WordMixStats,
  targetWords: readonly string[],
): void {
  const expected = calculateWordMixStats(targetWords);
  if (
    wordMixStats.short !== expected.short ||
    wordMixStats.medium !== expected.medium ||
    wordMixStats.long !== expected.long
  ) {
    throw parseError(
      'levelSession.wordMixStats must match actual target word length distribution.',
      'game-state.invariant.word-mix-stats',
      {
        actual: wordMixStats,
        expected,
      },
    );
  }
}

function resolveWordMixBounds(targetWordCount: number, targetRatio: number): WordMixBounds {
  return {
    min: Math.max(0, Math.floor(targetWordCount * targetRatio - WORD_MIX_CATEGORY_TOLERANCE)),
    max: Math.min(
      targetWordCount,
      Math.ceil(targetWordCount * targetRatio + WORD_MIX_CATEGORY_TOLERANCE),
    ),
  };
}

export function resolveLongWordQuota(targetWordCount: number): number {
  return Math.ceil(targetWordCount * LONG_WORD_MIX_TARGET_RATIO);
}

export function resolveLevelGeneratorScaffold(targetWordCount: number): LevelGeneratorScaffold {
  return {
    longWordQuota: resolveLongWordQuota(targetWordCount),
    wordMixBounds: {
      short: resolveWordMixBounds(targetWordCount, SHORT_WORD_MIX_TARGET_RATIO),
      medium: resolveWordMixBounds(targetWordCount, MEDIUM_WORD_MIX_TARGET_RATIO),
      long: resolveWordMixBounds(targetWordCount, LONG_WORD_MIX_TARGET_RATIO),
    },
  };
}

function assertLongWordQuota(wordMixStats: WordMixStats, targetWordCount: number): void {
  const requiredLongWordCount = resolveLongWordQuota(targetWordCount);

  if (wordMixStats.long < requiredLongWordCount) {
    throw parseError(
      `levelSession.targetWords must contain at least ${requiredLongWordCount} long words.`,
      'game-state.invariant.long-word-quota',
      {
        longWordCount: wordMixStats.long,
        requiredLongWordCount,
        targetWordCount,
      },
    );
  }
}

function assertWordMixScaffold(wordMixStats: WordMixStats, targetWordCount: number): void {
  const shortBounds = resolveWordMixBounds(targetWordCount, SHORT_WORD_MIX_TARGET_RATIO);
  const mediumBounds = resolveWordMixBounds(targetWordCount, MEDIUM_WORD_MIX_TARGET_RATIO);
  const longBounds = resolveWordMixBounds(targetWordCount, LONG_WORD_MIX_TARGET_RATIO);

  if (wordMixStats.short < shortBounds.min || wordMixStats.short > shortBounds.max) {
    throw parseError(
      'levelSession.wordMixStats.short must stay within the supported generator scaffold window.',
      'game-state.invariant.word-mix-scaffold',
      {
        category: 'short',
        actual: wordMixStats.short,
        min: shortBounds.min,
        max: shortBounds.max,
        targetWordCount,
      },
    );
  }

  if (wordMixStats.medium < mediumBounds.min || wordMixStats.medium > mediumBounds.max) {
    throw parseError(
      'levelSession.wordMixStats.medium must stay within the supported generator scaffold window.',
      'game-state.invariant.word-mix-scaffold',
      {
        category: 'medium',
        actual: wordMixStats.medium,
        min: mediumBounds.min,
        max: mediumBounds.max,
        targetWordCount,
      },
    );
  }

  if (wordMixStats.long > longBounds.max) {
    throw parseError(
      'levelSession.wordMixStats.long must stay within the supported generator scaffold window.',
      'game-state.invariant.word-mix-scaffold',
      {
        category: 'long',
        actual: wordMixStats.long,
        min: longBounds.min,
        max: longBounds.max,
        targetWordCount,
      },
    );
  }
}

function assertShortWordBalance(wordMixStats: WordMixStats): void {
  const allowedShortWordCount =
    Math.max(wordMixStats.medium, wordMixStats.long) + MAX_SHORT_WORD_ADVANTAGE;

  if (wordMixStats.short > allowedShortWordCount) {
    throw parseError(
      'levelSession.wordMixStats.short must not dominate medium/long target words.',
      'game-state.invariant.short-word-dominance',
      {
        shortWordCount: wordMixStats.short,
        mediumWordCount: wordMixStats.medium,
        longWordCount: wordMixStats.long,
        allowedShortWordCount,
      },
    );
  }
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

function resolveWordMixStats(
  targetWords: readonly string[],
  candidate: WordMixStatsInput | undefined,
): WordMixStats {
  if (candidate === undefined) {
    return calculateWordMixStats(targetWords);
  }

  return {
    short: assertNonNegativeSafeInteger(candidate.short, 'levelSession.wordMixStats.short'),
    medium: assertNonNegativeSafeInteger(candidate.medium, 'levelSession.wordMixStats.medium'),
    long: assertNonNegativeSafeInteger(candidate.long, 'levelSession.wordMixStats.long'),
  };
}

function resolveRemainingTargetWords(
  targetWords: readonly string[],
  foundTargets: readonly string[],
): readonly string[] {
  return sortWordsByDifficulty(
    targetWords.filter((targetWord) => !foundTargets.includes(targetWord)),
  );
}

export function calculateReadabilityScore(targetWords: readonly string[]): number {
  if (targetWords.length === 0) {
    return 0;
  }

  const totalLetters = targetWords.reduce((sum, targetWord) => {
    return sum + targetWord.length;
  }, 0);

  return Number((totalLetters / targetWords.length).toFixed(2));
}

function assertLevelReadabilityScore(readabilityScore: number): void {
  if (readabilityScore > MAX_LEVEL_READABILITY_SCORE) {
    throw parseError(
      `levelSession.readabilityScore must be <= ${MAX_LEVEL_READABILITY_SCORE}.`,
      'game-state.invariant.readability-score',
      {
        readabilityScore,
        maxReadabilityScore: MAX_LEVEL_READABILITY_SCORE,
      },
    );
  }
}

export function assertLevelGeneratorInvariants(
  levelSession: Pick<LevelSession, 'targetWords' | 'wordMixStats' | 'readabilityScore'>,
): void {
  assertTargetWordCount(levelSession.targetWords);
  assertLevelReadabilityScore(levelSession.readabilityScore);
  assertWordMixStatsMatchesTargetWords(levelSession.wordMixStats, levelSession.targetWords);
  assertLongWordQuota(levelSession.wordMixStats, levelSession.targetWords.length);
  assertWordMixScaffold(levelSession.wordMixStats, levelSession.targetWords.length);
  assertShortWordBalance(levelSession.wordMixStats);
}

function calculateDisplayedTargetTurnCount(
  path: readonly Readonly<{ readonly row: number; readonly col: number }>[],
): number {
  let turnCount = 0;
  let previousDirection: readonly [rowDelta: number, colDelta: number] | null = null;

  for (let index = 1; index < path.length; index += 1) {
    const previousCell = path[index - 1];
    const currentCell = path[index];

    if (previousCell === undefined || currentCell === undefined) {
      continue;
    }

    const direction: readonly [number, number] = [
      currentCell.row - previousCell.row,
      currentCell.col - previousCell.col,
    ];

    if (
      previousDirection !== null &&
      (previousDirection[0] !== direction[0] || previousDirection[1] !== direction[1])
    ) {
      turnCount += 1;
    }

    previousDirection = direction;
  }

  return turnCount;
}

function resolveDisplayedTargetMaxTurnCount(wordLength: number): number {
  return wordLength <= SHORT_WORD_MAX_LENGTH ? 2 : 3;
}

export function inspectDisplayedTargetReadability(
  levelSession: LevelSession,
  displayedTargetId: TargetWordId | null,
): DisplayedTargetReadabilityInspection | null {
  if (displayedTargetId === null) {
    return null;
  }

  const path = findWordPathInGrid(levelSession.grid, displayedTargetId);
  return {
    displayedTargetId,
    path,
    turnCount: path === null ? null : calculateDisplayedTargetTurnCount(path),
    maxTurnCount: resolveDisplayedTargetMaxTurnCount(displayedTargetId.length),
  };
}

export function assertDisplayedTargetReadabilityInvariant(
  levelSession: LevelSession,
  displayedTargetId: TargetWordId | null,
): void {
  const inspection = inspectDisplayedTargetReadability(levelSession, displayedTargetId);

  if (inspection === null) {
    return;
  }

  if (inspection.path === null) {
    throw parseError(
      'gameState.currentDisplayedTargetId must resolve to a path in levelSession.grid.',
      'game-state.invariant.displayed-target-readability',
      {
        displayedTargetId: inspection.displayedTargetId,
        reason: 'path-missing',
      },
    );
  }

  if (inspection.turnCount !== null && inspection.turnCount > inspection.maxTurnCount) {
    throw parseError(
      'gameState.currentDisplayedTargetId must resolve to a readable path.',
      'game-state.invariant.displayed-target-readability',
      {
        displayedTargetId: inspection.displayedTargetId,
        reason: 'turn-count',
        turnCount: inspection.turnCount,
        maxTurnCount: inspection.maxTurnCount,
      },
    );
  }
}

function assertOptionalTargetWordId(
  value: unknown,
  fieldName: string,
): TargetWordId | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return assertCyrillicWord(assertNonEmptyString(value, fieldName), fieldName);
}

function resolveGuidedTargetState(
  levelSession: LevelSession,
  targetWordIdCandidate: unknown,
  hintPathProgressCandidate: unknown,
): Pick<GameState, 'currentDisplayedTargetId' | 'currentHintPathProgress'> {
  const remainingTargets = resolveRemainingTargetWords(
    levelSession.targetWords,
    levelSession.foundTargets,
  );
  if (remainingTargets.length === 0) {
    return {
      currentDisplayedTargetId: null,
      currentHintPathProgress: 0,
    };
  }

  const preferredTargetWordId = assertOptionalTargetWordId(
    targetWordIdCandidate,
    'gameState.currentDisplayedTargetId',
  );
  const currentDisplayedTargetId =
    preferredTargetWordId && remainingTargets.includes(preferredTargetWordId)
      ? preferredTargetWordId
      : (remainingTargets[0] ?? null);
  const rawHintPathProgress =
    hintPathProgressCandidate === undefined
      ? 0
      : assertNonNegativeSafeInteger(
          hintPathProgressCandidate,
          'gameState.currentHintPathProgress',
        );

  if (!currentDisplayedTargetId || currentDisplayedTargetId !== preferredTargetWordId) {
    return {
      currentDisplayedTargetId,
      currentHintPathProgress: 0,
    };
  }

  return {
    currentDisplayedTargetId,
    currentHintPathProgress: Math.min(rawHintPathProgress, currentDisplayedTargetId.length),
  };
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

  if (
    leaderboardSync.lastSubmittedScore === LEADERBOARD_EMPTY_SCORE &&
    leaderboardSync.lastSubmitTs !== LEADERBOARD_EMPTY_SUBMIT_TS
  ) {
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

function createLegacyHelpLockState(helpWindow: HelpWindowInput | undefined): HelpLockState {
  if (!helpWindow) {
    return {
      isLocked: false,
      lockedUntil: null,
      reason: null,
    };
  }

  const normalizedHelpWindow = createHelpWindow(helpWindow);
  if (normalizedHelpWindow.pendingHelpRequest) {
    return {
      isLocked: true,
      lockedUntil: null,
      reason: 'pending-request',
    };
  }

  if (!normalizedHelpWindow.freeActionAvailable) {
    return {
      isLocked: true,
      lockedUntil: normalizedHelpWindow.windowStartTs + HELP_WINDOW_DURATION_MS,
      reason: 'legacy-free-window',
    };
  }

  return {
    isLocked: false,
    lockedUntil: null,
    reason: null,
  };
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

export function createHelpLockState(input: HelpLockStateInput): HelpLockState {
  const isLocked = assertBoolean(input.isLocked, 'helpLockState.isLocked');
  const lockedUntil = assertNullableNonNegativeSafeInteger(
    input.lockedUntil,
    'helpLockState.lockedUntil',
  );
  const reason =
    input.reason === undefined || input.reason === null
      ? null
      : assertLiteral(input.reason, 'helpLockState.reason', HELP_LOCK_REASONS);

  if (!isLocked && (lockedUntil !== null || reason !== null)) {
    throw parseError(
      'helpLockState.lockedUntil and helpLockState.reason must be null when helpLockState.isLocked is false.',
      'game-state.invariant.help-lock-unlocked-shape',
      {
        lockedUntil,
        reason,
      },
    );
  }

  if (isLocked && reason === null) {
    throw parseError(
      'helpLockState.reason must be provided when helpLockState.isLocked is true.',
      'game-state.invariant.help-lock-reason',
    );
  }

  return {
    isLocked,
    lockedUntil,
    reason,
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
  const targetWords = assertCyrillicWordArray(input.targetWords, 'levelSession.targetWords');
  const foundTargets = assertCyrillicWordArray(input.foundTargets, 'levelSession.foundTargets');
  const foundBonuses = assertCyrillicWordArray(input.foundBonuses, 'levelSession.foundBonuses');
  if (input.meta !== undefined) {
    assertLevelSessionMeta(input.meta, 'levelSession.meta');
  }
  const readabilityScore =
    input.readabilityScore === undefined
      ? calculateReadabilityScore(targetWords)
      : assertNonNegativeNumber(input.readabilityScore, 'levelSession.readabilityScore');
  const levelSession: LevelSession = {
    levelId: assertNonEmptyString(input.levelId, 'levelSession.levelId'),
    grid: assertGrid(input.grid, 'levelSession.grid'),
    targetWords,
    foundTargets,
    foundBonuses,
    status: assertLiteral(input.status, 'levelSession.status', LEVEL_SESSION_STATUSES),
    seed: assertFiniteNumber(input.seed, 'levelSession.seed'),
    readabilityScore,
    wordMixStats: resolveWordMixStats(targetWords, input.wordMixStats),
  };

  assertUniqueWords(levelSession.targetWords, 'levelSession.targetWords');
  assertLevelGeneratorInvariants(levelSession);
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
  const currentLevelSession = createLevelSession(input.currentLevelSession);
  const resetGuidedTargetState =
    options.previousState !== undefined &&
    options.previousState.currentLevelSession.levelId !== currentLevelSession.levelId;
  const guidedTargetState = resolveGuidedTargetState(
    currentLevelSession,
    resetGuidedTargetState ? undefined : input.currentDisplayedTargetId,
    resetGuidedTargetState ? undefined : input.currentHintPathProgress,
  );
  assertDisplayedTargetReadabilityInvariant(
    currentLevelSession,
    guidedTargetState.currentDisplayedTargetId,
  );
  const requestedSchemaVersion = assertNonNegativeSafeInteger(
    input.schemaVersion ?? GAME_STATE_SCHEMA_VERSION,
    'gameState.schemaVersion',
  );
  const nextState: GameState = {
    schemaVersion: Math.max(requestedSchemaVersion, GAME_STATE_SCHEMA_VERSION),
    stateVersion: assertNonNegativeSafeInteger(
      input.stateVersion ?? DEFAULT_STATE_VERSION,
      'gameState.stateVersion',
    ),
    updatedAt: assertNonNegativeSafeInteger(input.updatedAt, 'gameState.updatedAt'),
    allTimeScore: assertNonNegativeSafeInteger(input.allTimeScore, 'gameState.allTimeScore'),
    currentDisplayedTargetId: guidedTargetState.currentDisplayedTargetId,
    currentHintPathProgress: guidedTargetState.currentHintPathProgress,
    currentLevelSession,
    helpLockState:
      input.helpLockState === undefined
        ? createLegacyHelpLockState(input.helpWindow)
        : createHelpLockState(input.helpLockState),
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

function toHelpLockStateInput(value: unknown): HelpLockStateInput {
  return createHelpLockState(assertRecord(value, 'helpLockState') as unknown as HelpLockStateInput);
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
  const source = assertRecord(value, 'levelSession');

  return createLevelSession({
    levelId: source.levelId as string,
    grid: source.grid as readonly string[],
    targetWords: source.targetWords as readonly string[],
    foundTargets: source.foundTargets as readonly string[],
    foundBonuses: source.foundBonuses as readonly string[],
    status: source.status as LevelSessionStatus,
    seed: source.seed as number,
    ...(source.readabilityScore === undefined
      ? {}
      : {
          readabilityScore: source.readabilityScore as number,
        }),
    ...(source.wordMixStats === undefined
      ? {}
      : {
          wordMixStats: source.wordMixStats as WordMixStatsInput,
        }),
    ...(source.meta === undefined
      ? {}
      : {
          meta: assertLevelSessionMeta(source.meta, 'levelSession.meta'),
        }),
  });
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
    ...(source.currentDisplayedTargetId === undefined
      ? {}
      : {
          currentDisplayedTargetId: source.currentDisplayedTargetId as TargetWordId | null,
        }),
    ...(source.currentHintPathProgress === undefined
      ? {}
      : {
          currentHintPathProgress: source.currentHintPathProgress as number,
        }),
    currentLevelSession: toLevelSessionInput(source.currentLevelSession),
    ...(source.helpLockState === undefined
      ? {}
      : {
          helpLockState: toHelpLockStateInput(source.helpLockState),
        }),
    ...(source.helpWindow === undefined
      ? {}
      : {
          helpWindow: toHelpWindowInput(source.helpWindow),
        }),
    pendingOps,
    leaderboardSync: toLeaderboardSyncStateInput(source.leaderboardSync),
  };
}

function getSnapshotSchemaVersion(snapshot: Readonly<Record<string, unknown>>): number {
  if (snapshot.schemaVersion === undefined || snapshot.schemaVersion === null) {
    return SNAPSHOT_SCHEMA_VERSION_V0;
  }

  return assertNonNegativeInteger(snapshot.schemaVersion, 'gameState.schemaVersion');
}

function findSnapshotMigrationStepByFromVersion(
  fromVersion: number,
): SnapshotMigrationStep | undefined {
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

  if (schemaVersionBefore < SNAPSHOT_SCHEMA_VERSION_V0) {
    throw parseError(
      `Snapshot schema version ${schemaVersionBefore} is below supported minimum ${SNAPSHOT_SCHEMA_VERSION_V0}.`,
      'game-state.migration.unsupported-legacy-version',
      {
        schemaVersionBefore,
        minSupportedSchemaVersion: SNAPSHOT_SCHEMA_VERSION_V0,
      },
    );
  }

  let currentVersion = schemaVersionBefore;
  let currentSnapshot: Record<string, unknown> = { ...snapshot };
  const appliedMigrations: AppliedSnapshotMigration[] = [];

  while (currentVersion < GAME_STATE_SCHEMA_VERSION) {
    const migrationStep = findSnapshotMigrationStepByFromVersion(currentVersion);
    const expectedNextVersion = currentVersion + MIGRATION_VERSION_STEP;

    if (!migrationStep || migrationStep.toVersion !== expectedNextVersion) {
      throw parseError(
        `Missing deterministic snapshot migration step ${currentVersion} -> ${expectedNextVersion}.`,
        'game-state.migration.missing-step',
        {
          currentVersion,
          expectedNextVersion,
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
    return applySnapshotMigrations(assertRecord(snapshot, `${source} snapshot`)).state;
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
