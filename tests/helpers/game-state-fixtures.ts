import type { GameStateInput } from '../../src/domain/GameState';
import type { WordPathCellRef } from '../../src/domain/WordValidation';
import {
  cloneDefaultLevelDictionaryWords,
  cloneDefaultLevelGrid,
  cloneDefaultLevelPrefoundTargetWords,
  cloneDefaultLevelTargetWords,
} from '../../src/shared/default-level';
import { findWordPathInGrid } from '../../src/shared/word-grid';

interface FixtureStateOptions {
  readonly levelId: string;
  readonly source: string;
  readonly seed: number;
  readonly updatedAt?: number;
  readonly allTimeScore?: number;
  readonly schemaVersion?: number;
  readonly stateVersion?: number;
  readonly foundTargets?: readonly string[];
  readonly foundBonuses?: readonly string[];
  readonly meta?: Readonly<Record<string, string | number | boolean | null>>;
}

export function createFixtureGameStateInput(options: FixtureStateOptions): GameStateInput {
  return {
    schemaVersion: options.schemaVersion ?? 2,
    stateVersion: options.stateVersion ?? 0,
    updatedAt: options.updatedAt ?? 1_000,
    allTimeScore: options.allTimeScore ?? 0,
    currentLevelSession: {
      levelId: options.levelId,
      grid: cloneDefaultLevelGrid(),
      targetWords: cloneDefaultLevelTargetWords(),
      foundTargets: [...(options.foundTargets ?? [])],
      foundBonuses: [...(options.foundBonuses ?? [])],
      status: 'active',
      seed: options.seed,
      meta: {
        source: options.source,
        ...(options.meta ?? {}),
      },
    },
    helpWindow: {
      windowStartTs: options.updatedAt ?? 1_000,
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

export function createNearCompletionFixtureState(
  options: Omit<FixtureStateOptions, 'foundTargets'>,
): GameStateInput {
  return createFixtureGameStateInput({
    ...options,
    foundTargets: cloneDefaultLevelPrefoundTargetWords(),
  });
}

export function createDefaultDictionaryWords(): string[] {
  return cloneDefaultLevelDictionaryWords();
}

export function createWordPath(word: string, grid = cloneDefaultLevelGrid()): WordPathCellRef[] {
  const path = findWordPathInGrid(grid, word);
  if (!path) {
    throw new Error(`Missing path for word "${word}".`);
  }

  return path.map((cell) => ({
    row: cell.row,
    col: cell.col,
  }));
}
