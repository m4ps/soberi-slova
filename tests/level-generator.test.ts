import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { WordEntry } from '../src/domain/GameState';
import {
  createLevelGeneratorModule,
  LevelGeneratorDomainError,
  type GeneratedLevel,
} from '../src/domain/LevelGenerator';
import { buildDictionaryIndexFromCsv } from '../src/domain/WordValidation';
import { WORD_GRID_CELL_COUNT, WORD_GRID_SIDE } from '../src/shared/word-grid';

const GRID_SIDE = WORD_GRID_SIDE;
const GRID_CELL_COUNT = WORD_GRID_CELL_COUNT;
const SHORT_WORD_MIN = 3;
const SHORT_WORD_MAX = 4;
const MEDIUM_WORD_MAX = 6;
const TARGET_WORDS_MIN = 10;
const TARGET_WORDS_MAX = 15;
const MIN_READABLE_TARGETS = 10;
const MAX_LEVEL_READABILITY_SCORE = MEDIUM_WORD_MAX;
const MAX_CELL_USAGE = 5;

function loadDictionaryEntries(): readonly WordEntry[] {
  const dictionaryCsvPath = path.resolve(process.cwd(), 'data/dictionary.csv');
  const csvContent = fs.readFileSync(dictionaryCsvPath, 'utf8');
  const { index } = buildDictionaryIndexFromCsv(csvContent);
  const entries: WordEntry[] = [];

  for (const normalizedWord of index.normalizedWords) {
    const entry = index.getEntryByNormalizedWord(normalizedWord);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function isReadableTargetWord(word: string): boolean {
  return word.length >= SHORT_WORD_MIN && word.length <= MEDIUM_WORD_MAX;
}

function countReadableTargetWords(words: readonly string[]): number {
  return words.reduce((count, word) => (isReadableTargetWord(word) ? count + 1 : count), 0);
}

function calculateReadabilityScore(words: readonly string[]): number {
  const totalLetters = words.reduce((sum, word) => sum + word.length, 0);
  return Number((totalLetters / words.length).toFixed(2));
}

function calculatePathTurnCount(path: readonly number[]): number {
  let turns = 0;
  let previousDirection: readonly [rowDelta: number, colDelta: number] | null = null;

  for (let index = 1; index < path.length; index += 1) {
    const currentCell = path[index];
    const previousCell = path[index - 1];
    if (currentCell === undefined || previousCell === undefined) {
      continue;
    }

    const direction: readonly [number, number] = [
      Math.floor(currentCell / GRID_SIDE) - Math.floor(previousCell / GRID_SIDE),
      (currentCell % GRID_SIDE) - (previousCell % GRID_SIDE),
    ];

    if (
      previousDirection !== null &&
      (previousDirection[0] !== direction[0] || previousDirection[1] !== direction[1])
    ) {
      turns += 1;
    }

    previousDirection = direction;
  }

  return turns;
}

function resolveMaxTurnCount(wordLength: number): number {
  return wordLength <= SHORT_WORD_MAX ? 2 : 3;
}

function calculateCellUsage(placements: GeneratedLevel['placements']): number[] {
  const usage = new Array<number>(GRID_CELL_COUNT).fill(0);

  for (const placement of placements) {
    for (const cellIndex of placement.cellIndexes) {
      if (usage[cellIndex] !== undefined) {
        usage[cellIndex] += 1;
      }
    }
  }

  return usage;
}

function expectGeneratedLevelToMatchInvariants(level: GeneratedLevel): void {
  expect(level.gridSize).toBe(GRID_SIDE);
  expect(level.grid).toHaveLength(GRID_CELL_COUNT);
  expect(level.targetWords.length).toBeGreaterThanOrEqual(TARGET_WORDS_MIN);
  expect(level.targetWords.length).toBeLessThanOrEqual(TARGET_WORDS_MAX);
  expect(new Set(level.targetWords).size).toBe(level.targetWords.length);

  const readableTargetCount = countReadableTargetWords(level.targetWords);
  expect(readableTargetCount).toBeGreaterThanOrEqual(MIN_READABLE_TARGETS);
  expect(readableTargetCount).toBeGreaterThan(level.targetWords.length - readableTargetCount);
  expect(calculateReadabilityScore(level.targetWords)).toBeLessThanOrEqual(
    MAX_LEVEL_READABILITY_SCORE,
  );

  expect(level.placements).toHaveLength(level.targetWords.length);

  for (const [placementIndex, placement] of level.placements.entries()) {
    expect(placement.word).toBe(level.targetWords[placementIndex]);
    expect(placement.cellIndexes).toHaveLength(placement.word.length);

    const usedCells = new Set<number>();

    for (let index = 0; index < placement.cellIndexes.length; index += 1) {
      const cellIndex = placement.cellIndexes[index];
      expect(Number.isInteger(cellIndex)).toBe(true);

      if (cellIndex === undefined) {
        continue;
      }

      expect(cellIndex).toBeGreaterThanOrEqual(0);
      expect(cellIndex).toBeLessThan(GRID_CELL_COUNT);
      expect(usedCells.has(cellIndex)).toBe(false);
      usedCells.add(cellIndex);

      const expectedLetter = placement.word[index];
      const actualLetter = level.grid[cellIndex];
      expect(actualLetter).toBe(expectedLetter);

      if (index === 0) {
        continue;
      }

      const previousCellIndex = placement.cellIndexes[index - 1];
      if (previousCellIndex === undefined) {
        continue;
      }

      const rowDelta = Math.abs(
        Math.floor(cellIndex / GRID_SIDE) - Math.floor(previousCellIndex / GRID_SIDE),
      );
      const colDelta = Math.abs((cellIndex % GRID_SIDE) - (previousCellIndex % GRID_SIDE));
      expect(rowDelta).toBeLessThanOrEqual(1);
      expect(colDelta).toBeLessThanOrEqual(1);
      expect(rowDelta === 0 && colDelta === 0).toBe(false);
    }

    expect(calculatePathTurnCount(placement.cellIndexes)).toBeLessThanOrEqual(
      resolveMaxTurnCount(placement.word.length),
    );
  }

  expect(Math.max(...calculateCellUsage(level.placements))).toBeLessThanOrEqual(MAX_CELL_USAGE);
}

function createDictionaryEntry(word: string, id: number, rank: number): WordEntry {
  return {
    id,
    bare: word,
    rank,
    type: 'noun',
    normalized: word,
  };
}

describe('LevelGenerator module', () => {
  const dictionaryEntries = loadDictionaryEntries();

  it('generates valid level with deterministic word-first layout and path placements', () => {
    const module = createLevelGeneratorModule({
      dictionaryEntries,
    });

    const level = module.generateLevel({
      seed: 20260225,
      targetWordCount: 15,
    });

    expectGeneratedLevelToMatchInvariants(level);
    expect(level.meta.generationAttempts).toBeGreaterThanOrEqual(1);
  });

  it('remains deterministic for the same seed and input window', () => {
    const module = createLevelGeneratorModule({
      dictionaryEntries,
      recentWordWindowSize: 32,
    });

    const request = {
      seed: 734592,
      targetWordCount: 12,
      recentTargetWords: dictionaryEntries.slice(0, 30).map((entry) => entry.normalized),
    };

    const first = module.generateLevel(request);
    const second = module.generateLevel(request);

    expect(first).toEqual(second);
  });

  it('keeps generation stable across a broad deterministic seed sample', () => {
    const module = createLevelGeneratorModule({
      dictionaryEntries,
    });

    for (let seed = 1; seed <= 32; seed += 1) {
      const level = module.generateLevel({
        seed,
      });

      expectGeneratedLevelToMatchInvariants(level);
    }
  });

  it('avoids repeating recent target words when enough alternatives exist', () => {
    const module = createLevelGeneratorModule({
      dictionaryEntries,
      recentWordWindowSize: 120,
    });
    const recentTargetWords = dictionaryEntries.slice(0, 120).map((entry) => entry.normalized);
    const recentWordsSet = new Set(recentTargetWords);

    const level = module.generateLevel({
      seed: 445566,
      targetWordCount: 12,
      recentTargetWords,
    });

    expect(level.targetWords.some((word) => recentWordsSet.has(word))).toBe(false);
  });

  it('throws typed domain error for invalid seed', () => {
    const module = createLevelGeneratorModule({
      dictionaryEntries,
    });

    expect(() => module.generateLevel({ seed: Number.NaN })).toThrowError(
      LevelGeneratorDomainError,
    );
  });

  it('rejects dictionaries without minimum readable short/medium coverage', () => {
    const incompleteDictionary = [
      createDictionaryEntry('дом', 1, 10),
      createDictionaryEntry('сад', 2, 11),
      createDictionaryEntry('река', 3, 12),
      createDictionaryEntry('город', 4, 13),
    ];

    const module = createLevelGeneratorModule({
      dictionaryEntries: incompleteDictionary,
    });

    expect(() => module.generateLevel({ seed: 101, targetWordCount: 10 })).toThrowError(
      LevelGeneratorDomainError,
    );
  });
});
