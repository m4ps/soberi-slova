import { describe, expect, it } from 'vitest';

import { createWordValidationModule, resolveWordFromPath } from '../src/domain/WordValidation';

function buildGrid(rows: readonly string[]): readonly string[] {
  if (rows.length !== 5 || rows.some((row) => row.length !== 5)) {
    throw new Error('Grid rows must be 5x5.');
  }

  return rows.join('').split('');
}

const BASE_GRID = buildGrid(['домяя', 'котяя', 'ёлкая', 'елкая', 'сырок']);

describe('WordValidation module', () => {
  it('classifies words as target, bonus, repeat or invalid', () => {
    const module = createWordValidationModule(new Set(['дом', 'кот', 'ёлка', 'елка']));

    expect(
      module.validateWord({
        word: ' Дом ',
        targetWords: ['дом', 'ёлка'],
        foundWords: new Set<string>(),
      }),
    ).toBe('target');

    expect(
      module.validateWord({
        word: 'кот',
        targetWords: ['дом', 'ёлка'],
        foundWords: new Set<string>(),
      }),
    ).toBe('bonus');

    expect(
      module.validateWord({
        word: 'ДОМ',
        targetWords: ['дом', 'ёлка'],
        foundWords: new Set(['дом']),
      }),
    ).toBe('repeat');

    expect(
      module.validateWord({
        word: 'мимо',
        targetWords: ['дом', 'ёлка'],
        foundWords: new Set<string>(),
      }),
    ).toBe('invalid');
  });

  it('accepts target words even when they are not present in dictionary lookup set', () => {
    const module = createWordValidationModule(new Set(['дом', 'кот']));

    expect(
      module.validateWord({
        word: 'дорога',
        targetWords: ['дорога'],
        foundWords: new Set<string>(),
      }),
    ).toBe('target');

    expect(
      module.validateWord({
        word: 'дорога',
        targetWords: ['дом'],
        foundWords: new Set<string>(),
      }),
    ).toBe('invalid');
  });

  it('resolves submitted path into normalized word and rejects malformed path/grid payload', () => {
    expect(
      resolveWordFromPath(BASE_GRID, [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ]),
    ).toBe('дом');

    expect(
      resolveWordFromPath(BASE_GRID, [
        { row: 2, col: 0 },
        { row: 2, col: 1 },
        { row: 2, col: 2 },
        { row: 2, col: 3 },
      ]),
    ).toBe('ёлка');

    expect(resolveWordFromPath(BASE_GRID, [{ row: 5, col: 0 }])).toBeNull();
    expect(resolveWordFromPath(BASE_GRID.slice(0, 24), [{ row: 0, col: 0 }])).toBeNull();
    expect(
      resolveWordFromPath(buildGrid(['дом1я', 'котяя', 'ёлкая', 'елкая', 'сырок']), [
        { row: 0, col: 3 },
      ]),
    ).toBeNull();
  });

  it('differentiates letter "ё" from "е" during validation and path submit classification', () => {
    const module = createWordValidationModule(new Set(['ёлка']));

    expect(
      module.validateWord({
        word: 'ЁЛКА',
        targetWords: ['ёлка'],
        foundWords: new Set<string>(),
      }),
    ).toBe('target');

    expect(
      module.validatePathWord({
        grid: BASE_GRID,
        pathCells: [
          { row: 3, col: 0 },
          { row: 3, col: 1 },
          { row: 3, col: 2 },
          { row: 3, col: 3 },
        ],
        targetWords: ['ёлка'],
        foundTargets: [],
        foundBonuses: [],
      }),
    ).toEqual({
      result: 'invalid',
      normalizedWord: 'елка',
    });
  });

  it('applies target/bonus/repeat results without mutating state for repeat or invalid', () => {
    const module = createWordValidationModule(new Set(['дом', 'кот', 'ёлка']));

    const foundTargets = ['дом'];
    const foundBonuses = ['кот'];

    const repeatResult = module.applyPathWord({
      grid: BASE_GRID,
      pathCells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      targetWords: ['дом', 'ёлка'],
      foundTargets,
      foundBonuses,
    });

    expect(repeatResult.result).toBe('repeat');
    expect(repeatResult.isSilent).toBe(true);
    expect(repeatResult.nextFoundTargets).toBe(foundTargets);
    expect(repeatResult.nextFoundBonuses).toBe(foundBonuses);

    const targetResult = module.applyPathWord({
      grid: BASE_GRID,
      pathCells: [
        { row: 2, col: 0 },
        { row: 2, col: 1 },
        { row: 2, col: 2 },
        { row: 2, col: 3 },
      ],
      targetWords: ['дом', 'ёлка'],
      foundTargets: ['дом'],
      foundBonuses: [],
    });

    expect(targetResult).toEqual({
      result: 'target',
      normalizedWord: 'ёлка',
      nextFoundTargets: ['дом', 'ёлка'],
      nextFoundBonuses: [],
      isSilent: false,
    });

    const bonusResult = module.applyPathWord({
      grid: BASE_GRID,
      pathCells: [
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
      ],
      targetWords: ['дом', 'ёлка'],
      foundTargets: [],
      foundBonuses: [],
    });

    expect(bonusResult).toEqual({
      result: 'bonus',
      normalizedWord: 'кот',
      nextFoundTargets: [],
      nextFoundBonuses: ['кот'],
      isSilent: false,
    });

    const invalidResult = module.applyPathWord({
      grid: BASE_GRID,
      pathCells: [{ row: -1, col: 0 }],
      targetWords: ['дом', 'ёлка'],
      foundTargets: ['дом'],
      foundBonuses: ['кот'],
    });

    expect(invalidResult).toEqual({
      result: 'invalid',
      normalizedWord: null,
      nextFoundTargets: ['дом'],
      nextFoundBonuses: ['кот'],
      isSilent: true,
    });
  });
});
