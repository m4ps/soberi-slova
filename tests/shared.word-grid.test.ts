import { describe, expect, it } from 'vitest';

import {
  WORD_GRID_CELL_COUNT,
  WORD_GRID_SIDE,
  findWordPathInGrid,
  sortWordsByDifficulty,
} from '../src/shared/word-grid';
import { cloneDefaultLevelGrid } from '../src/shared/default-level';

describe('shared word-grid helpers', () => {
  it('sorts words by difficulty (length, then lexicographically)', () => {
    expect(sortWordsByDifficulty(['мир', 'дом', 'аист', 'бор', 'арк'])).toEqual([
      'арк',
      'бор',
      'дом',
      'мир',
      'аист',
    ]);
  });

  it(`finds a valid path for an existing target word in a ${WORD_GRID_SIDE}x${WORD_GRID_SIDE} grid`, () => {
    const grid = cloneDefaultLevelGrid();

    expect(grid).toHaveLength(WORD_GRID_CELL_COUNT);
    expect(findWordPathInGrid(grid, 'дом')).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);
  });

  it('returns null for invalid or unreachable paths', () => {
    expect(findWordPathInGrid(['д', 'о', 'м'], 'дом')).toBeNull();
    expect(findWordPathInGrid(new Array(WORD_GRID_CELL_COUNT).fill('а'), 'дом')).toBeNull();
  });
});
