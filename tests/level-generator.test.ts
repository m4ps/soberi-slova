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

const GRID_SIDE = 5;
const GRID_CELL_COUNT = GRID_SIDE * GRID_SIDE;
const SHORT_WORD_MIN = 3;
const SHORT_WORD_MAX = 4;
const MEDIUM_WORD_MIN = 5;
const MEDIUM_WORD_MAX = 6;
const LONG_WORD_MIN = 7;
const TARGET_WORDS_MIN = 3;
const TARGET_WORDS_MAX = 7;

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

function expectGeneratedLevelToMatchInvariants(level: GeneratedLevel): void {
  expect(level.gridSize).toBe(GRID_SIDE);
  expect(level.grid).toHaveLength(GRID_CELL_COUNT);
  expect(level.targetWords.length).toBeGreaterThanOrEqual(TARGET_WORDS_MIN);
  expect(level.targetWords.length).toBeLessThanOrEqual(TARGET_WORDS_MAX);
  expect(new Set(level.targetWords).size).toBe(level.targetWords.length);

  const targetLengths = level.targetWords.map((word) => word.length);
  expect(targetLengths.some((length) => length >= SHORT_WORD_MIN && length <= SHORT_WORD_MAX)).toBe(
    true,
  );
  expect(
    targetLengths.some((length) => length >= MEDIUM_WORD_MIN && length <= MEDIUM_WORD_MAX),
  ).toBe(true);
  expect(targetLengths.some((length) => length >= LONG_WORD_MIN)).toBe(true);

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
  }
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
      targetWordCount: 7,
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
      targetWordCount: 6,
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

    for (let seed = 1; seed <= 48; seed += 1) {
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
      targetWordCount: 5,
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

  it('rejects dictionaries without required short/medium/long categories', () => {
    const incompleteDictionary = [
      createDictionaryEntry('дом', 1, 10),
      createDictionaryEntry('сад', 2, 11),
      createDictionaryEntry('река', 3, 12),
      createDictionaryEntry('город', 4, 13),
    ];

    const module = createLevelGeneratorModule({
      dictionaryEntries: incompleteDictionary,
    });

    expect(() => module.generateLevel({ seed: 101, targetWordCount: 3 })).toThrowError(
      LevelGeneratorDomainError,
    );
  });
});
