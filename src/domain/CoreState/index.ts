import { MODULE_IDS } from '../../shared/module-ids';
import {
  createGameState,
  type GameState,
  type GameStateInput,
  type LevelSession,
} from '../GameState';
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
  readonly progress: CoreStateProgressSnapshot;
  readonly foundTargets: readonly string[];
  readonly foundBonuses: readonly string[];
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
  readonly scoreDelta: CoreStateScoreDelta;
  readonly progress: CoreStateProgressSnapshot;
  readonly levelStatus: LevelSession['status'];
  readonly allTimeScore: number;
  readonly stateVersion: number;
}

export interface CoreStateModuleOptions {
  readonly initialMode?: RuntimeMode;
  readonly initialGameState?: GameStateInput;
  readonly wordValidation?: WordValidationModule;
  readonly nowProvider?: () => number;
}

export interface CoreStateModule {
  readonly moduleName: typeof MODULE_IDS.coreState;
  getSnapshot: () => CoreStateSnapshot;
  setRuntimeMode: (runtimeMode: RuntimeMode) => void;
  submitPath: (pathCells: readonly WordPathCellRef[], nowTs?: number) => CoreStateSubmitResult;
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
        source: 'default-core-state',
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

function createGameplaySnapshot(gameState: GameState): CoreStateGameplaySnapshot {
  return {
    allTimeScore: gameState.allTimeScore,
    stateVersion: gameState.stateVersion,
    updatedAt: gameState.updatedAt,
    levelId: gameState.currentLevelSession.levelId,
    levelStatus: gameState.currentLevelSession.status,
    progress: createProgressSnapshot(gameState.currentLevelSession),
    foundTargets: [...gameState.currentLevelSession.foundTargets],
    foundBonuses: [...gameState.currentLevelSession.foundBonuses],
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
): CoreStateSubmitResult {
  return {
    result,
    normalizedWord,
    isSilent,
    levelClearAwarded,
    scoreDelta,
    progress: createProgressSnapshot(gameState.currentLevelSession),
    levelStatus: gameState.currentLevelSession.status,
    allTimeScore: gameState.allTimeScore,
    stateVersion: gameState.stateVersion,
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
  const wordValidation =
    options.wordValidation ?? createWordValidationModule(new Set(DEFAULT_DICTIONARY_WORDS));

  let runtimeMode: RuntimeMode = options.initialMode ?? 'bootstrapping';
  let gameState = createGameState(
    options.initialGameState ?? createDefaultGameStateInput(nowProvider()),
  );

  const buildSnapshot = (): CoreStateSnapshot => {
    const stateCopy = cloneGameState(gameState);

    return {
      runtimeMode,
      gameState: stateCopy,
      gameplay: createGameplaySnapshot(stateCopy),
    };
  };

  return {
    moduleName: MODULE_IDS.coreState,
    getSnapshot: () => buildSnapshot(),
    setRuntimeMode: (nextRuntimeMode) => {
      runtimeMode = nextRuntimeMode;
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
      const blockedByCompletedLevel =
        !levelIsActive && (wordApply.result === 'target' || wordApply.result === 'bonus');

      if (wordApply.isSilent || blockedByCompletedLevel || wordApply.normalizedWord === null) {
        return createSubmitResult(
          blockedByCompletedLevel ? 'invalid' : wordApply.result,
          wordApply.normalizedWord,
          gameState,
        );
      }

      const wordScore = calculateWordScore(wordApply.result, wordApply.normalizedWord);
      const isLastTargetWord =
        wordApply.result === 'target' &&
        wordApply.nextFoundTargets.length === currentLevelSession.targetWords.length;
      const levelClearScore = isLastTargetWord
        ? calculateLevelClearScore(currentLevelSession.targetWords.length)
        : 0;

      const nextState = createGameState(
        {
          ...toGameStateInput(gameState),
          stateVersion: gameState.stateVersion + 1,
          updatedAt: nowTs,
          allTimeScore: gameState.allTimeScore + wordScore + levelClearScore,
          currentLevelSession: {
            ...currentLevelSession,
            foundTargets: wordApply.nextFoundTargets,
            foundBonuses: wordApply.nextFoundBonuses,
            status: isLastTargetWord ? 'completed' : currentLevelSession.status,
          },
        },
        {
          previousState: gameState,
        },
      );

      gameState = nextState;

      return createSubmitResult(
        wordApply.result,
        wordApply.normalizedWord,
        gameState,
        {
          wordScore,
          levelClearScore,
          totalScore: wordScore + levelClearScore,
        },
        isLastTargetWord,
        false,
      );
    },
  };
}
