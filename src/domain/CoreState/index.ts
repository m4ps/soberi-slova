import { MODULE_IDS } from '../../shared/module-ids';
import type { HelpKind } from '../HelpEconomy';
import {
  createGameState,
  deserializeGameStateWithMigrations,
  type GameState,
  type GameStateInput,
  type LevelSession,
  type PendingOperation,
  type PendingOperationKind,
  type PendingOperationStatus,
  resolveLwwSnapshot,
} from '../GameState';
import { createLevelGeneratorModule, type LevelGeneratorModule } from '../LevelGenerator';
import {
  createWordValidationModule,
  type WordPathCellRef,
  type WordValidationModule,
  type WordValidationResult,
} from '../WordValidation';

export type RuntimeMode = 'bootstrapping' | 'ready';

const GRID_SIDE = 5;
const GRID_CELL_COUNT = GRID_SIDE * GRID_SIDE;
const DEFAULT_LEVEL_ID = 'level-1';
const DEFAULT_LEVEL_TARGET_WORDS = ['дом', 'нос', 'сон'] as const;
const DEFAULT_DICTIONARY_WORDS = [...DEFAULT_LEVEL_TARGET_WORDS, 'том', 'тон'] as const;
const TARGET_SCORE_BASE = 10;
const TARGET_SCORE_PER_LETTER = 2;
const BONUS_SCORE_BASE = 2;
const BONUS_SCORE_PER_LETTER = 1;
const LEVEL_CLEAR_SCORE_BASE = 30;
const LEVEL_CLEAR_SCORE_PER_TARGET = 5;
const PENDING_OPERATION_STATUS_PENDING: PendingOperationStatus = 'pending';
const PENDING_OPERATION_KIND_WORD_SUCCESS: PendingOperationKind = 'word-success-animation';
const PENDING_OPERATION_KIND_LEVEL_TRANSITION: PendingOperationKind = 'level-transition';
const DEFAULT_LEVEL_META_SOURCE = 'default-core-state';
const AUTO_NEXT_LEVEL_META_SOURCE = 'core-state-auto-next';
const MANUAL_RESHUFFLE_LEVEL_META_SOURCE = 'core-state-manual-reshuffle';
const RESTORE_FALLBACK_LEVEL_META_SOURCE = 'core-state-restore-fallback';
const AUTO_NEXT_LEVEL_ID_SUFFIX = 'next';
const MANUAL_RESHUFFLE_LEVEL_ID_SUFFIX = 'reshuffle';
const RESTORE_FALLBACK_LEVEL_ID_SUFFIX = 'restore';
const HINT_META_TARGET_WORD_KEY = 'hintTargetWord';
const HINT_META_REVEAL_COUNT_KEY = 'hintRevealCount';
const HINT_INITIAL_REVEAL_COUNT = 2;
const RECENT_TARGET_WORDS_MAX = 64;
const PROCESSED_HELP_OPERATION_IDS_MAX = 128;
const WORD_SCORE_EMPTY = 0;
const OPERATION_RETRY_COUNT_DEFAULT = 0;
const GRID_DIRECTIONS: readonly Readonly<{
  readonly rowOffset: number;
  readonly colOffset: number;
}>[] = [
  { rowOffset: -1, colOffset: -1 },
  { rowOffset: -1, colOffset: 0 },
  { rowOffset: -1, colOffset: 1 },
  { rowOffset: 0, colOffset: -1 },
  { rowOffset: 0, colOffset: 1 },
  { rowOffset: 1, colOffset: -1 },
  { rowOffset: 1, colOffset: 0 },
  { rowOffset: 1, colOffset: 1 },
];

const DEFAULT_LEVEL_GRID: readonly string[] = [
  'д',
  'о',
  'м',
  'к',
  'о',
  'т',
  'н',
  'о',
  'с',
  'а',
  'л',
  'и',
  'м',
  'р',
  'е',
  'п',
  'у',
  'т',
  'ь',
  'я',
  'б',
  'в',
  'г',
  'ё',
  'ж',
];

export interface CoreStateProgressSnapshot {
  readonly foundTargets: number;
  readonly totalTargets: number;
}

export interface CoreStateGameplaySnapshot {
  readonly allTimeScore: number;
  readonly stateVersion: number;
  readonly updatedAt: number;
  readonly levelId: string;
  readonly levelStatus: LevelSession['status'];
  readonly isInputLocked: boolean;
  readonly showEphemeralCongrats: boolean;
  readonly progress: CoreStateProgressSnapshot;
  readonly foundTargets: readonly string[];
  readonly foundBonuses: readonly string[];
  readonly pendingWordSuccessOperationId: string | null;
  readonly pendingLevelTransitionOperationId: string | null;
}

export interface CoreStateSnapshot {
  readonly runtimeMode: RuntimeMode;
  readonly gameState: GameState;
  readonly gameplay: CoreStateGameplaySnapshot;
}

export interface CoreStateScoreDelta {
  readonly wordScore: number;
  readonly levelClearScore: number;
  readonly totalScore: number;
}

export interface CoreStateSubmitResult {
  readonly result: WordValidationResult;
  readonly normalizedWord: string | null;
  readonly isSilent: boolean;
  readonly levelClearAwarded: boolean;
  readonly wordSuccessOperationId: string | null;
  readonly scoreDelta: CoreStateScoreDelta;
  readonly progress: CoreStateProgressSnapshot;
  readonly levelStatus: LevelSession['status'];
  readonly allTimeScore: number;
  readonly stateVersion: number;
}

export interface CoreStateWordSuccessAckResult {
  readonly operationId: string;
  readonly handled: boolean;
  readonly levelClearAwarded: boolean;
  readonly levelTransitionOperationId: string | null;
  readonly scoreDelta: CoreStateScoreDelta;
  readonly levelStatus: LevelSession['status'];
  readonly showEphemeralCongrats: boolean;
  readonly allTimeScore: number;
  readonly stateVersion: number;
}

export interface CoreStateLevelTransitionAckResult {
  readonly operationId: string;
  readonly handled: boolean;
  readonly transitionedToNextLevel: boolean;
  readonly levelId: string;
  readonly levelStatus: LevelSession['status'];
  readonly allTimeScore: number;
  readonly stateVersion: number;
}

export type CoreStateHelpApplyResultReason =
  | 'applied'
  | 'invalid-operation-id'
  | 'operation-already-applied'
  | 'level-not-active'
  | 'no-remaining-targets'
  | 'target-path-unavailable';

export interface CoreStateHintEffect {
  readonly kind: 'hint';
  readonly targetWord: string;
  readonly revealCount: number;
  readonly revealedLetters: string;
  readonly revealedPathCells: readonly WordPathCellRef[];
}

export interface CoreStateReshuffleEffect {
  readonly kind: 'reshuffle';
  readonly previousLevelId: string;
  readonly nextLevelId: string;
  readonly nextSeed: number;
}

export type CoreStateHelpEffect = CoreStateHintEffect | CoreStateReshuffleEffect;

export interface CoreStateHelpApplyResult {
  readonly operationId: string;
  readonly kind: HelpKind;
  readonly applied: boolean;
  readonly reason: CoreStateHelpApplyResultReason;
  readonly levelStatus: LevelSession['status'];
  readonly levelId: string;
  readonly stateVersion: number;
  readonly allTimeScore: number;
  readonly effect: CoreStateHelpEffect | null;
}

export interface CoreStateRestoreSnapshotInput {
  readonly gameStateSerialized: string | null;
}

export interface CoreStateRestorePayload {
  readonly localSnapshot: CoreStateRestoreSnapshotInput | null;
  readonly cloudSnapshot: CoreStateRestoreSnapshotInput | null;
  readonly cloudAllTimeScore: number | null;
}

export type CoreStateRestoreSource = 'local' | 'cloud' | 'none';

export interface CoreStateRestoreResult {
  readonly restored: boolean;
  readonly levelRestored: boolean;
  readonly source: CoreStateRestoreSource;
  readonly allTimeScore: number;
  readonly stateVersion: number;
  readonly levelId: string;
}

export interface CoreStateModuleOptions {
  readonly initialMode?: RuntimeMode;
  readonly initialGameState?: GameStateInput;
  readonly wordValidation?: WordValidationModule;
  readonly levelGenerator?: LevelGeneratorModule;
  readonly nowProvider?: () => number;
}

export interface CoreStateModule {
  readonly moduleName: typeof MODULE_IDS.coreState;
  getSnapshot: () => CoreStateSnapshot;
  setRuntimeMode: (runtimeMode: RuntimeMode) => void;
  restoreSession: (payload: CoreStateRestorePayload, nowTs?: number) => CoreStateRestoreResult;
  submitPath: (pathCells: readonly WordPathCellRef[], nowTs?: number) => CoreStateSubmitResult;
  acknowledgeWordSuccessAnimation: (
    operationId: string,
    nowTs?: number,
  ) => CoreStateWordSuccessAckResult;
  acknowledgeLevelTransitionDone: (
    operationId: string,
    nowTs?: number,
  ) => CoreStateLevelTransitionAckResult;
  applyHelp: (kind: HelpKind, operationId: string, nowTs?: number) => CoreStateHelpApplyResult;
}

function createDefaultLevelGrid(): readonly string[] {
  if (DEFAULT_LEVEL_GRID.length !== GRID_CELL_COUNT) {
    throw new Error(`Invalid default grid length: expected ${GRID_CELL_COUNT} cells.`);
  }

  return [...DEFAULT_LEVEL_GRID];
}

function createDefaultGameStateInput(nowTs: number): GameStateInput {
  return {
    updatedAt: nowTs,
    allTimeScore: 0,
    currentLevelSession: {
      levelId: DEFAULT_LEVEL_ID,
      grid: createDefaultLevelGrid(),
      targetWords: [...DEFAULT_LEVEL_TARGET_WORDS],
      foundTargets: [],
      foundBonuses: [],
      status: 'active',
      seed: 1,
      meta: {
        source: DEFAULT_LEVEL_META_SOURCE,
      },
    },
    helpWindow: {
      windowStartTs: nowTs,
      freeActionAvailable: true,
      pendingHelpRequest: null,
    },
    pendingOps: [],
    leaderboardSync: {
      lastSubmittedScore: 0,
      lastAckScore: 0,
      lastSubmitTs: 0,
    },
  };
}

function toGameStateInput(state: GameState): GameStateInput {
  return {
    schemaVersion: state.schemaVersion,
    stateVersion: state.stateVersion,
    updatedAt: state.updatedAt,
    allTimeScore: state.allTimeScore,
    currentLevelSession: {
      levelId: state.currentLevelSession.levelId,
      grid: [...state.currentLevelSession.grid],
      targetWords: [...state.currentLevelSession.targetWords],
      foundTargets: [...state.currentLevelSession.foundTargets],
      foundBonuses: [...state.currentLevelSession.foundBonuses],
      status: state.currentLevelSession.status,
      seed: state.currentLevelSession.seed,
      meta: { ...state.currentLevelSession.meta },
    },
    helpWindow: {
      windowStartTs: state.helpWindow.windowStartTs,
      freeActionAvailable: state.helpWindow.freeActionAvailable,
      pendingHelpRequest: state.helpWindow.pendingHelpRequest
        ? {
            operationId: state.helpWindow.pendingHelpRequest.operationId,
            kind: state.helpWindow.pendingHelpRequest.kind,
          }
        : null,
    },
    pendingOps: state.pendingOps.map((operation) => ({
      operationId: operation.operationId,
      kind: operation.kind,
      status: operation.status,
      retryCount: operation.retryCount,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    })),
    leaderboardSync: {
      lastSubmittedScore: state.leaderboardSync.lastSubmittedScore,
      lastAckScore: state.leaderboardSync.lastAckScore,
      lastSubmitTs: state.leaderboardSync.lastSubmitTs,
    },
  };
}

function cloneGameState(state: GameState): GameState {
  return createGameState(toGameStateInput(state));
}

function createProgressSnapshot(levelSession: LevelSession): CoreStateProgressSnapshot {
  return {
    foundTargets: levelSession.foundTargets.length,
    totalTargets: levelSession.targetWords.length,
  };
}

function isInputLocked(levelStatus: LevelSession['status']): boolean {
  return levelStatus !== 'active';
}

function createPendingOperation(
  operationId: string,
  kind: PendingOperationKind,
  nowTs: number,
): PendingOperation {
  return {
    operationId,
    kind,
    status: PENDING_OPERATION_STATUS_PENDING,
    retryCount: OPERATION_RETRY_COUNT_DEFAULT,
    createdAt: nowTs,
    updatedAt: nowTs,
  };
}

function appendPendingOperation(
  pendingOps: readonly PendingOperation[],
  operation: PendingOperation,
): readonly PendingOperation[] {
  return [...pendingOps.filter((item) => item.operationId !== operation.operationId), operation];
}

function removePendingOperation(
  pendingOps: readonly PendingOperation[],
  operationId: string,
): readonly PendingOperation[] {
  return pendingOps.filter((item) => item.operationId !== operationId);
}

function hasPendingOperation(
  pendingOps: readonly PendingOperation[],
  operationId: string,
  kind: PendingOperationKind,
): boolean {
  return pendingOps.some((item) => {
    return (
      item.operationId === operationId &&
      item.kind === kind &&
      item.status === PENDING_OPERATION_STATUS_PENDING
    );
  });
}

function findPendingOperationIdByKind(
  pendingOps: readonly PendingOperation[],
  kind: PendingOperationKind,
): string | null {
  const operation = pendingOps.find((item) => {
    return item.kind === kind && item.status === PENDING_OPERATION_STATUS_PENDING;
  });

  return operation ? operation.operationId : null;
}

function normalizeOperationId(operationId: string): string | null {
  const normalized = operationId.trim();
  return normalized.length > 0 ? normalized : null;
}

function trimRecentTargetWords(words: readonly string[]): readonly string[] {
  if (words.length <= RECENT_TARGET_WORDS_MAX) {
    return [...words];
  }

  return words.slice(words.length - RECENT_TARGET_WORDS_MAX);
}

function createNextLevelId(currentLevelId: string, fallbackSequence: number): string {
  const numericSuffixMatch = currentLevelId.match(/^(.*?)(\d+)$/);
  if (numericSuffixMatch) {
    const [, prefix, suffix] = numericSuffixMatch;
    if (suffix) {
      const parsedSuffix = Number.parseInt(suffix, 10);
      if (Number.isSafeInteger(parsedSuffix) && parsedSuffix >= 0) {
        return `${prefix}${parsedSuffix + 1}`;
      }
    }
  }

  return `${currentLevelId}-${AUTO_NEXT_LEVEL_ID_SUFFIX}-${fallbackSequence}`;
}

function createReshuffleLevelId(currentLevelId: string, fallbackSequence: number): string {
  return `${currentLevelId}-${MANUAL_RESHUFFLE_LEVEL_ID_SUFFIX}-${fallbackSequence}`;
}

function createRestoreFallbackLevelId(currentLevelId: string, fallbackSequence: number): string {
  return `${currentLevelId}-${RESTORE_FALLBACK_LEVEL_ID_SUFFIX}-${fallbackSequence}`;
}

function isRecordLike(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function parseNonNegativeSafeInteger(value: unknown): number | null {
  if (typeof value !== 'number') {
    return null;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    return null;
  }

  return Math.trunc(value);
}

interface ParsedCoreStateRestoreSnapshot {
  readonly gameState: GameState | null;
  readonly allTimeScoreHint: number | null;
  readonly stateVersionHint: number | null;
  readonly seedHint: number | null;
}

function parseCoreStateRestoreSnapshot(
  snapshot: CoreStateRestoreSnapshotInput | null,
): ParsedCoreStateRestoreSnapshot {
  const serialized = snapshot?.gameStateSerialized;
  if (typeof serialized !== 'string' || serialized.trim().length === 0) {
    return {
      gameState: null,
      allTimeScoreHint: null,
      stateVersionHint: null,
      seedHint: null,
    };
  }

  let gameState: GameState | null = null;
  try {
    gameState = deserializeGameStateWithMigrations(serialized).state;
  } catch {
    // Invalid snapshot is handled via best-effort score/seed hints.
  }

  let allTimeScoreHint: number | null = null;
  let stateVersionHint: number | null = null;
  let seedHint: number | null = null;

  try {
    const parsed = JSON.parse(serialized);
    if (isRecordLike(parsed)) {
      allTimeScoreHint = parseNonNegativeSafeInteger(parsed.allTimeScore);
      stateVersionHint = parseNonNegativeSafeInteger(parsed.stateVersion);

      const levelSessionCandidate = parsed.currentLevelSession;
      if (isRecordLike(levelSessionCandidate)) {
        seedHint = parseNonNegativeSafeInteger(levelSessionCandidate.seed);
      }
    }
  } catch {
    // Best-effort hints remain null when snapshot JSON is malformed.
  }

  return {
    gameState,
    allTimeScoreHint,
    stateVersionHint,
    seedHint,
  };
}

function isLevelSessionRestorable(state: GameState): boolean {
  return state.currentLevelSession.status === 'active' && state.pendingOps.length === 0;
}

function normalizeRestoredScore(candidateScores: readonly (number | null)[]): number {
  let nextScore = 0;

  candidateScores.forEach((candidateScore) => {
    if (candidateScore === null) {
      return;
    }

    nextScore = Math.max(nextScore, candidateScore);
  });

  return nextScore;
}

function createRestoreLeaderboardSync(
  state: GameState | null,
  allTimeScore: number,
): GameStateInput['leaderboardSync'] {
  if (!state) {
    return {
      lastSubmittedScore: 0,
      lastAckScore: 0,
      lastSubmitTs: 0,
    };
  }

  const lastSubmittedScore = Math.min(state.leaderboardSync.lastSubmittedScore, allTimeScore);
  const lastAckScore = Math.min(state.leaderboardSync.lastAckScore, lastSubmittedScore);
  const lastSubmitTs = lastSubmittedScore === 0 ? 0 : state.leaderboardSync.lastSubmitTs;

  return {
    lastSubmittedScore,
    lastAckScore,
    lastSubmitTs,
  };
}

function compareWordsByDifficulty(left: string, right: string): number {
  if (left.length !== right.length) {
    return left.length - right.length;
  }

  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function sortWordsByDifficulty(words: readonly string[]): readonly string[] {
  return [...words].sort(compareWordsByDifficulty);
}

function isGridCellInsideBounds(row: number, col: number): boolean {
  return row >= 0 && row < GRID_SIDE && col >= 0 && col < GRID_SIDE;
}

function toGridCellIndex(row: number, col: number): number {
  return row * GRID_SIDE + col;
}

function findPathForTargetWord(
  grid: readonly string[],
  targetWord: string,
): readonly WordPathCellRef[] | null {
  if (targetWord.length === 0 || grid.length !== GRID_CELL_COUNT) {
    return null;
  }

  const path: WordPathCellRef[] = [];
  const visited = new Set<number>();

  const dfs = (row: number, col: number, letterIndex: number): boolean => {
    if (!isGridCellInsideBounds(row, col)) {
      return false;
    }

    const cellIndex = toGridCellIndex(row, col);
    if (visited.has(cellIndex)) {
      return false;
    }

    if (grid[cellIndex] !== targetWord[letterIndex]) {
      return false;
    }

    visited.add(cellIndex);
    path.push({ row, col });

    if (letterIndex === targetWord.length - 1) {
      return true;
    }

    for (const direction of GRID_DIRECTIONS) {
      if (dfs(row + direction.rowOffset, col + direction.colOffset, letterIndex + 1)) {
        return true;
      }
    }

    path.pop();
    visited.delete(cellIndex);
    return false;
  };

  for (let row = 0; row < GRID_SIDE; row += 1) {
    for (let col = 0; col < GRID_SIDE; col += 1) {
      if (dfs(row, col, 0)) {
        return [...path];
      }

      path.length = 0;
      visited.clear();
    }
  }

  return null;
}

function resolveHintTargetWord(levelSession: LevelSession): string | null {
  const remainingTargets = levelSession.targetWords.filter((targetWord) => {
    return !levelSession.foundTargets.includes(targetWord);
  });

  if (remainingTargets.length === 0) {
    return null;
  }

  const currentHintTarget = levelSession.meta[HINT_META_TARGET_WORD_KEY];
  if (typeof currentHintTarget === 'string' && remainingTargets.includes(currentHintTarget)) {
    return currentHintTarget;
  }

  const [easiestTargetWord] = sortWordsByDifficulty(remainingTargets);
  return easiestTargetWord ?? null;
}

function resolveNextHintRevealCount(levelSession: LevelSession, targetWord: string): number {
  const currentHintTarget = levelSession.meta[HINT_META_TARGET_WORD_KEY];
  const currentRevealCount = levelSession.meta[HINT_META_REVEAL_COUNT_KEY];
  const normalizedCurrentRevealCount =
    typeof currentRevealCount === 'number' && Number.isSafeInteger(currentRevealCount)
      ? Math.max(0, Math.trunc(currentRevealCount))
      : 0;

  const startsFromInitialReveal = Math.min(HINT_INITIAL_REVEAL_COUNT, targetWord.length);
  if (currentHintTarget !== targetWord) {
    return startsFromInitialReveal;
  }

  return Math.min(
    targetWord.length,
    Math.max(startsFromInitialReveal, normalizedCurrentRevealCount + 1),
  );
}

function createGameplaySnapshot(
  gameState: GameState,
  showEphemeralCongrats: boolean,
): CoreStateGameplaySnapshot {
  return {
    allTimeScore: gameState.allTimeScore,
    stateVersion: gameState.stateVersion,
    updatedAt: gameState.updatedAt,
    levelId: gameState.currentLevelSession.levelId,
    levelStatus: gameState.currentLevelSession.status,
    isInputLocked: isInputLocked(gameState.currentLevelSession.status),
    showEphemeralCongrats,
    progress: createProgressSnapshot(gameState.currentLevelSession),
    foundTargets: [...gameState.currentLevelSession.foundTargets],
    foundBonuses: [...gameState.currentLevelSession.foundBonuses],
    pendingWordSuccessOperationId: findPendingOperationIdByKind(
      gameState.pendingOps,
      PENDING_OPERATION_KIND_WORD_SUCCESS,
    ),
    pendingLevelTransitionOperationId: findPendingOperationIdByKind(
      gameState.pendingOps,
      PENDING_OPERATION_KIND_LEVEL_TRANSITION,
    ),
  };
}

function createSubmitResult(
  result: WordValidationResult,
  normalizedWord: string | null,
  gameState: GameState,
  scoreDelta: CoreStateScoreDelta = {
    wordScore: 0,
    levelClearScore: 0,
    totalScore: 0,
  },
  levelClearAwarded: boolean = false,
  isSilent: boolean = true,
  wordSuccessOperationId: string | null = null,
): CoreStateSubmitResult {
  return {
    result,
    normalizedWord,
    isSilent,
    levelClearAwarded,
    wordSuccessOperationId,
    scoreDelta,
    progress: createProgressSnapshot(gameState.currentLevelSession),
    levelStatus: gameState.currentLevelSession.status,
    allTimeScore: gameState.allTimeScore,
    stateVersion: gameState.stateVersion,
  };
}

function createWordSuccessAckResult(
  operationId: string,
  handled: boolean,
  levelClearAwarded: boolean,
  gameState: GameState,
  scoreDelta: CoreStateScoreDelta,
  levelTransitionOperationId: string | null,
  showEphemeralCongrats: boolean,
): CoreStateWordSuccessAckResult {
  return {
    operationId,
    handled,
    levelClearAwarded,
    levelTransitionOperationId,
    scoreDelta,
    levelStatus: gameState.currentLevelSession.status,
    showEphemeralCongrats,
    allTimeScore: gameState.allTimeScore,
    stateVersion: gameState.stateVersion,
  };
}

function createLevelTransitionAckResult(
  operationId: string,
  handled: boolean,
  transitionedToNextLevel: boolean,
  gameState: GameState,
): CoreStateLevelTransitionAckResult {
  return {
    operationId,
    handled,
    transitionedToNextLevel,
    levelId: gameState.currentLevelSession.levelId,
    levelStatus: gameState.currentLevelSession.status,
    allTimeScore: gameState.allTimeScore,
    stateVersion: gameState.stateVersion,
  };
}

function createHelpApplyResult(
  operationId: string,
  kind: HelpKind,
  applied: boolean,
  reason: CoreStateHelpApplyResultReason,
  gameState: GameState,
  effect: CoreStateHelpEffect | null = null,
): CoreStateHelpApplyResult {
  return {
    operationId,
    kind,
    applied,
    reason,
    levelStatus: gameState.currentLevelSession.status,
    levelId: gameState.currentLevelSession.levelId,
    stateVersion: gameState.stateVersion,
    allTimeScore: gameState.allTimeScore,
    effect,
  };
}

function calculateWordScore(result: WordValidationResult, normalizedWord: string | null): number {
  if (!normalizedWord || normalizedWord.length === 0) {
    return 0;
  }

  if (result === 'target') {
    return TARGET_SCORE_BASE + TARGET_SCORE_PER_LETTER * normalizedWord.length;
  }

  if (result === 'bonus') {
    return BONUS_SCORE_BASE + BONUS_SCORE_PER_LETTER * normalizedWord.length;
  }

  return 0;
}

function calculateLevelClearScore(targetCount: number): number {
  return LEVEL_CLEAR_SCORE_BASE + LEVEL_CLEAR_SCORE_PER_TARGET * targetCount;
}

export function createCoreStateModule(options: CoreStateModuleOptions = {}): CoreStateModule {
  const nowProvider = options.nowProvider ?? (() => Date.now());
  const levelGenerator = options.levelGenerator ?? createLevelGeneratorModule();
  const wordValidation =
    options.wordValidation ?? createWordValidationModule(new Set(DEFAULT_DICTIONARY_WORDS));

  let runtimeMode: RuntimeMode = options.initialMode ?? 'bootstrapping';
  let gameState = createGameState(
    options.initialGameState ?? createDefaultGameStateInput(nowProvider()),
  );
  let showEphemeralCongrats = false;
  let operationSequence = 0;
  let fallbackLevelIdSequence = 0;
  let reshuffleLevelIdSequence = 0;
  let restoreFallbackLevelIdSequence = 0;
  let recentTargetWords = trimRecentTargetWords(gameState.currentLevelSession.targetWords);
  const processedHelpOperationIds = new Set<string>();
  const processedHelpOperationQueue: string[] = [];

  const createOperationId = (kind: PendingOperationKind): string => {
    operationSequence += 1;
    return `op-${kind}-${gameState.stateVersion + 1}-${operationSequence}`;
  };

  const hasProcessedHelpOperation = (operationId: string): boolean => {
    return processedHelpOperationIds.has(operationId);
  };

  const markHelpOperationProcessed = (operationId: string): void => {
    if (processedHelpOperationIds.has(operationId)) {
      return;
    }

    processedHelpOperationIds.add(operationId);
    processedHelpOperationQueue.push(operationId);

    if (processedHelpOperationQueue.length > PROCESSED_HELP_OPERATION_IDS_MAX) {
      const expiredOperationId = processedHelpOperationQueue.shift();
      if (expiredOperationId) {
        processedHelpOperationIds.delete(expiredOperationId);
      }
    }
  };

  const createAutoNextLevelSession = (): GameStateInput['currentLevelSession'] => {
    const currentLevelSession = gameState.currentLevelSession;
    const nextSeed = currentLevelSession.seed + 1;
    const recentWordsForGeneration = trimRecentTargetWords([
      ...recentTargetWords,
      ...currentLevelSession.targetWords,
    ]);
    const generatedLevel = levelGenerator.generateLevel({
      seed: nextSeed,
      recentTargetWords: recentWordsForGeneration,
    });

    fallbackLevelIdSequence += 1;
    recentTargetWords = trimRecentTargetWords([
      ...recentWordsForGeneration,
      ...generatedLevel.targetWords,
    ]);

    return {
      levelId: createNextLevelId(currentLevelSession.levelId, fallbackLevelIdSequence),
      grid: [...generatedLevel.grid],
      targetWords: [...generatedLevel.targetWords],
      foundTargets: [],
      foundBonuses: [],
      status: 'active',
      seed: generatedLevel.seed,
      meta: {
        source: AUTO_NEXT_LEVEL_META_SOURCE,
        previousLevelId: currentLevelSession.levelId,
        generationAttempts: generatedLevel.meta.generationAttempts,
        replacements: generatedLevel.meta.replacements,
        backtracks: generatedLevel.meta.backtracks,
        rareLetterCount: generatedLevel.meta.rareLetterCount,
        rareLetterRatio: generatedLevel.meta.rareLetterRatio,
      },
    };
  };

  const createManualReshuffleLevelSession = (): GameStateInput['currentLevelSession'] => {
    const currentLevelSession = gameState.currentLevelSession;
    const nextSeed = currentLevelSession.seed + 1;
    const recentWordsForGeneration = trimRecentTargetWords([
      ...recentTargetWords,
      ...currentLevelSession.targetWords,
    ]);
    const generatedLevel = levelGenerator.generateLevel({
      seed: nextSeed,
      recentTargetWords: recentWordsForGeneration,
    });

    reshuffleLevelIdSequence += 1;
    recentTargetWords = trimRecentTargetWords([
      ...recentWordsForGeneration,
      ...generatedLevel.targetWords,
    ]);

    return {
      levelId: createReshuffleLevelId(currentLevelSession.levelId, reshuffleLevelIdSequence),
      grid: [...generatedLevel.grid],
      targetWords: [...generatedLevel.targetWords],
      foundTargets: [],
      foundBonuses: [],
      status: 'active',
      seed: generatedLevel.seed,
      meta: {
        source: MANUAL_RESHUFFLE_LEVEL_META_SOURCE,
        previousLevelId: currentLevelSession.levelId,
        generationAttempts: generatedLevel.meta.generationAttempts,
        replacements: generatedLevel.meta.replacements,
        backtracks: generatedLevel.meta.backtracks,
        rareLetterCount: generatedLevel.meta.rareLetterCount,
        rareLetterRatio: generatedLevel.meta.rareLetterRatio,
      },
    };
  };

  const createRestoreFallbackLevelSession = (
    baseLevelSession: LevelSession | null,
  ): GameStateInput['currentLevelSession'] => {
    const fallbackBaseLevel = baseLevelSession ?? gameState.currentLevelSession;
    const nextSeed = Math.max(1, fallbackBaseLevel.seed + 1);
    const recentWordsForGeneration = trimRecentTargetWords([
      ...recentTargetWords,
      ...fallbackBaseLevel.targetWords,
    ]);
    const generatedLevel = levelGenerator.generateLevel({
      seed: nextSeed,
      recentTargetWords: recentWordsForGeneration,
    });

    restoreFallbackLevelIdSequence += 1;
    recentTargetWords = trimRecentTargetWords([
      ...recentWordsForGeneration,
      ...generatedLevel.targetWords,
    ]);

    return {
      levelId: createRestoreFallbackLevelId(
        fallbackBaseLevel.levelId,
        restoreFallbackLevelIdSequence,
      ),
      grid: [...generatedLevel.grid],
      targetWords: [...generatedLevel.targetWords],
      foundTargets: [],
      foundBonuses: [],
      status: 'active',
      seed: generatedLevel.seed,
      meta: {
        source: RESTORE_FALLBACK_LEVEL_META_SOURCE,
        previousLevelId: fallbackBaseLevel.levelId,
        generationAttempts: generatedLevel.meta.generationAttempts,
        replacements: generatedLevel.meta.replacements,
        backtracks: generatedLevel.meta.backtracks,
        rareLetterCount: generatedLevel.meta.rareLetterCount,
        rareLetterRatio: generatedLevel.meta.rareLetterRatio,
      },
    };
  };

  const buildSnapshot = (): CoreStateSnapshot => {
    const stateCopy = cloneGameState(gameState);

    return {
      runtimeMode,
      gameState: stateCopy,
      gameplay: createGameplaySnapshot(stateCopy, showEphemeralCongrats),
    };
  };

  return {
    moduleName: MODULE_IDS.coreState,
    getSnapshot: () => buildSnapshot(),
    setRuntimeMode: (nextRuntimeMode) => {
      runtimeMode = nextRuntimeMode;
    },
    restoreSession: (payload, nowTs = nowProvider()) => {
      const normalizedRestoreTs = Math.max(0, Math.trunc(nowTs));
      const localSnapshot = parseCoreStateRestoreSnapshot(payload.localSnapshot);
      const cloudSnapshot = parseCoreStateRestoreSnapshot(payload.cloudSnapshot);
      const cloudAllTimeScore = parseNonNegativeSafeInteger(payload.cloudAllTimeScore);

      let restoredSource: CoreStateRestoreSource = 'none';
      let restoredState: GameState | null = null;

      if (localSnapshot.gameState && cloudSnapshot.gameState) {
        const resolution = resolveLwwSnapshot(localSnapshot.gameState, cloudSnapshot.gameState);
        restoredSource = resolution.winner;
        restoredState = cloneGameState(resolution.resolvedState);
      } else if (localSnapshot.gameState) {
        restoredSource = 'local';
        restoredState = cloneGameState(localSnapshot.gameState);
      } else if (cloudSnapshot.gameState) {
        restoredSource = 'cloud';
        restoredState = cloneGameState(cloudSnapshot.gameState);
      }

      const restoredScore = normalizeRestoredScore([
        cloudAllTimeScore,
        localSnapshot.allTimeScoreHint,
        cloudSnapshot.allTimeScoreHint,
        restoredState?.allTimeScore ?? null,
      ]);

      const buildFallbackState = (sourceState: GameState | null): GameState => {
        const defaultState = createDefaultGameStateInput(normalizedRestoreTs);
        const versionHints = [
          gameState.stateVersion,
          localSnapshot.stateVersionHint ?? 0,
          cloudSnapshot.stateVersionHint ?? 0,
          sourceState ? sourceState.stateVersion + 1 : 0,
        ];
        const nextStateVersion = Math.max(...versionHints);
        const fallbackLevelSession = createRestoreFallbackLevelSession(
          sourceState?.currentLevelSession ?? null,
        );
        const fallbackHelpWindow = sourceState?.helpWindow ?? defaultState.helpWindow;

        return createGameState({
          ...defaultState,
          stateVersion: nextStateVersion,
          updatedAt: normalizedRestoreTs,
          allTimeScore: restoredScore,
          currentLevelSession: fallbackLevelSession,
          helpWindow: {
            windowStartTs: fallbackHelpWindow.windowStartTs,
            freeActionAvailable: fallbackHelpWindow.freeActionAvailable,
            pendingHelpRequest: null,
          },
          pendingOps: [],
          leaderboardSync: createRestoreLeaderboardSync(sourceState, restoredScore),
        });
      };

      let levelRestored = false;
      if (restoredState) {
        if (restoredScore > restoredState.allTimeScore) {
          restoredState = createGameState({
            ...toGameStateInput(restoredState),
            stateVersion: restoredState.stateVersion + 1,
            updatedAt: Math.max(restoredState.updatedAt, normalizedRestoreTs),
            allTimeScore: restoredScore,
            leaderboardSync: createRestoreLeaderboardSync(restoredState, restoredScore),
          });
        }

        if (isLevelSessionRestorable(restoredState)) {
          levelRestored = true;
          gameState = restoredState;
        } else {
          gameState = buildFallbackState(restoredState);
        }
      } else {
        gameState = buildFallbackState(null);
      }

      recentTargetWords = trimRecentTargetWords(gameState.currentLevelSession.targetWords);
      showEphemeralCongrats = false;

      return {
        restored:
          restoredState !== null ||
          restoredScore > 0 ||
          (payload.localSnapshot?.gameStateSerialized?.trim().length ?? 0) > 0 ||
          (payload.cloudSnapshot?.gameStateSerialized?.trim().length ?? 0) > 0,
        levelRestored,
        source: restoredSource,
        allTimeScore: gameState.allTimeScore,
        stateVersion: gameState.stateVersion,
        levelId: gameState.currentLevelSession.levelId,
      };
    },
    submitPath: (pathCells, nowTs = nowProvider()) => {
      const currentLevelSession = gameState.currentLevelSession;

      const wordApply = wordValidation.applyPathWord({
        grid: currentLevelSession.grid,
        pathCells,
        targetWords: currentLevelSession.targetWords,
        foundTargets: currentLevelSession.foundTargets,
        foundBonuses: currentLevelSession.foundBonuses,
      });

      const levelIsActive = currentLevelSession.status === 'active';

      if (!levelIsActive) {
        return createSubmitResult('invalid', wordApply.normalizedWord, gameState);
      }

      if (wordApply.isSilent || wordApply.normalizedWord === null) {
        return createSubmitResult(wordApply.result, wordApply.normalizedWord, gameState);
      }

      const wordScore = calculateWordScore(wordApply.result, wordApply.normalizedWord);
      const isLastTargetWord =
        wordApply.result === 'target' &&
        wordApply.nextFoundTargets.length === currentLevelSession.targetWords.length;
      const wordSuccessOperationId = isLastTargetWord
        ? createOperationId(PENDING_OPERATION_KIND_WORD_SUCCESS)
        : null;
      const nextPendingOps = wordSuccessOperationId
        ? appendPendingOperation(
            gameState.pendingOps,
            createPendingOperation(
              wordSuccessOperationId,
              PENDING_OPERATION_KIND_WORD_SUCCESS,
              nowTs,
            ),
          )
        : gameState.pendingOps;

      const nextState = createGameState(
        {
          ...toGameStateInput(gameState),
          stateVersion: gameState.stateVersion + 1,
          updatedAt: nowTs,
          allTimeScore: gameState.allTimeScore + wordScore,
          currentLevelSession: {
            ...currentLevelSession,
            foundTargets: wordApply.nextFoundTargets,
            foundBonuses: wordApply.nextFoundBonuses,
            status: isLastTargetWord ? 'completed' : currentLevelSession.status,
          },
          pendingOps: nextPendingOps,
        },
        {
          previousState: gameState,
        },
      );

      gameState = nextState;
      if (!isLastTargetWord) {
        showEphemeralCongrats = false;
      }

      return createSubmitResult(
        wordApply.result,
        wordApply.normalizedWord,
        gameState,
        {
          wordScore,
          levelClearScore: WORD_SCORE_EMPTY,
          totalScore: wordScore,
        },
        false,
        false,
        wordSuccessOperationId,
      );
    },
    applyHelp: (kind, operationId, nowTs = nowProvider()) => {
      const normalizedOperationId = normalizeOperationId(operationId);
      if (!normalizedOperationId) {
        return createHelpApplyResult(operationId, kind, false, 'invalid-operation-id', gameState);
      }

      if (hasProcessedHelpOperation(normalizedOperationId)) {
        return createHelpApplyResult(
          normalizedOperationId,
          kind,
          false,
          'operation-already-applied',
          gameState,
        );
      }

      const currentLevelSession = gameState.currentLevelSession;
      if (currentLevelSession.status !== 'active') {
        return createHelpApplyResult(
          normalizedOperationId,
          kind,
          false,
          'level-not-active',
          gameState,
        );
      }

      if (kind === 'hint') {
        const hintTargetWord = resolveHintTargetWord(currentLevelSession);
        if (!hintTargetWord) {
          return createHelpApplyResult(
            normalizedOperationId,
            kind,
            false,
            'no-remaining-targets',
            gameState,
          );
        }

        const targetPath = findPathForTargetWord(currentLevelSession.grid, hintTargetWord);
        if (!targetPath) {
          return createHelpApplyResult(
            normalizedOperationId,
            kind,
            false,
            'target-path-unavailable',
            gameState,
          );
        }

        const revealCount = resolveNextHintRevealCount(currentLevelSession, hintTargetWord);
        const nextState = createGameState(
          {
            ...toGameStateInput(gameState),
            stateVersion: gameState.stateVersion + 1,
            updatedAt: nowTs,
            currentLevelSession: {
              ...currentLevelSession,
              meta: {
                ...currentLevelSession.meta,
                [HINT_META_TARGET_WORD_KEY]: hintTargetWord,
                [HINT_META_REVEAL_COUNT_KEY]: revealCount,
              },
            },
          },
          {
            previousState: gameState,
          },
        );

        gameState = nextState;
        showEphemeralCongrats = false;
        markHelpOperationProcessed(normalizedOperationId);

        return createHelpApplyResult(normalizedOperationId, kind, true, 'applied', gameState, {
          kind: 'hint',
          targetWord: hintTargetWord,
          revealCount,
          revealedLetters: hintTargetWord.slice(0, revealCount),
          revealedPathCells: targetPath.slice(0, revealCount),
        });
      }

      const nextLevelSession = createManualReshuffleLevelSession();
      const previousLevelId = currentLevelSession.levelId;
      const reshufflingState = createGameState(
        {
          ...toGameStateInput(gameState),
          stateVersion: gameState.stateVersion + 1,
          updatedAt: nowTs,
          currentLevelSession: {
            ...currentLevelSession,
            status: 'reshuffling',
          },
        },
        {
          previousState: gameState,
        },
      );
      const nextState = createGameState(
        {
          ...toGameStateInput(reshufflingState),
          stateVersion: reshufflingState.stateVersion + 1,
          updatedAt: nowTs,
          currentLevelSession: nextLevelSession,
        },
        {
          previousState: reshufflingState,
        },
      );

      gameState = nextState;
      showEphemeralCongrats = false;
      markHelpOperationProcessed(normalizedOperationId);

      return createHelpApplyResult(normalizedOperationId, kind, true, 'applied', gameState, {
        kind: 'reshuffle',
        previousLevelId,
        nextLevelId: nextLevelSession.levelId,
        nextSeed: nextLevelSession.seed,
      });
    },
    acknowledgeWordSuccessAnimation: (operationId, nowTs = nowProvider()) => {
      const normalizedOperationId = normalizeOperationId(operationId);
      const noOpScoreDelta: CoreStateScoreDelta = {
        wordScore: WORD_SCORE_EMPTY,
        levelClearScore: WORD_SCORE_EMPTY,
        totalScore: WORD_SCORE_EMPTY,
      };

      if (!normalizedOperationId) {
        return createWordSuccessAckResult(
          operationId,
          false,
          false,
          gameState,
          noOpScoreDelta,
          null,
          showEphemeralCongrats,
        );
      }

      if (
        !hasPendingOperation(
          gameState.pendingOps,
          normalizedOperationId,
          PENDING_OPERATION_KIND_WORD_SUCCESS,
        )
      ) {
        return createWordSuccessAckResult(
          normalizedOperationId,
          false,
          false,
          gameState,
          noOpScoreDelta,
          null,
          showEphemeralCongrats,
        );
      }

      const currentLevelSession = gameState.currentLevelSession;
      let nextPendingOps = removePendingOperation(gameState.pendingOps, normalizedOperationId);
      let levelClearScore = WORD_SCORE_EMPTY;
      let levelTransitionOperationId: string | null = null;
      let nextLevelStatus = currentLevelSession.status;

      if (currentLevelSession.status === 'completed') {
        levelClearScore = calculateLevelClearScore(currentLevelSession.targetWords.length);
        levelTransitionOperationId = createOperationId(PENDING_OPERATION_KIND_LEVEL_TRANSITION);
        nextPendingOps = appendPendingOperation(
          nextPendingOps,
          createPendingOperation(
            levelTransitionOperationId,
            PENDING_OPERATION_KIND_LEVEL_TRANSITION,
            nowTs,
          ),
        );
        nextLevelStatus = 'reshuffling';
        showEphemeralCongrats = true;
      }

      const nextState = createGameState(
        {
          ...toGameStateInput(gameState),
          stateVersion: gameState.stateVersion + 1,
          updatedAt: nowTs,
          allTimeScore: gameState.allTimeScore + levelClearScore,
          currentLevelSession: {
            ...currentLevelSession,
            status: nextLevelStatus,
          },
          pendingOps: nextPendingOps,
        },
        {
          previousState: gameState,
        },
      );

      gameState = nextState;

      return createWordSuccessAckResult(
        normalizedOperationId,
        true,
        levelClearScore > WORD_SCORE_EMPTY,
        gameState,
        {
          wordScore: WORD_SCORE_EMPTY,
          levelClearScore,
          totalScore: levelClearScore,
        },
        levelTransitionOperationId,
        showEphemeralCongrats,
      );
    },
    acknowledgeLevelTransitionDone: (operationId, nowTs = nowProvider()) => {
      const normalizedOperationId = normalizeOperationId(operationId);
      if (!normalizedOperationId) {
        return createLevelTransitionAckResult(operationId, false, false, gameState);
      }

      const currentLevelSession = gameState.currentLevelSession;
      if (
        currentLevelSession.status !== 'reshuffling' ||
        !hasPendingOperation(
          gameState.pendingOps,
          normalizedOperationId,
          PENDING_OPERATION_KIND_LEVEL_TRANSITION,
        )
      ) {
        return createLevelTransitionAckResult(normalizedOperationId, false, false, gameState);
      }

      const nextState = createGameState(
        {
          ...toGameStateInput(gameState),
          stateVersion: gameState.stateVersion + 1,
          updatedAt: nowTs,
          currentLevelSession: createAutoNextLevelSession(),
          pendingOps: removePendingOperation(gameState.pendingOps, normalizedOperationId),
        },
        {
          previousState: gameState,
        },
      );

      gameState = nextState;
      showEphemeralCongrats = false;

      return createLevelTransitionAckResult(normalizedOperationId, true, true, gameState);
    },
  };
}
