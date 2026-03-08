export interface WordGridCellRef {
  readonly row: number;
  readonly col: number;
}

const WORD_GRID_DIRECTIONS: readonly Readonly<{
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

export const WORD_GRID_SIDE = 6;
export const WORD_GRID_CELL_COUNT = WORD_GRID_SIDE * WORD_GRID_SIDE;
export const HINT_META_TARGET_WORD_KEY = 'hintTargetWord';
export const HINT_META_REVEAL_COUNT_KEY = 'hintRevealCount';

export function resolveWordGridSideFromLength(length: number): number | null {
  if (!Number.isSafeInteger(length) || length <= 0) {
    return null;
  }

  const side = Math.sqrt(length);
  return Number.isSafeInteger(side) ? side : null;
}

export function compareWordsByDifficulty(left: string, right: string): number {
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

export function sortWordsByDifficulty(words: readonly string[]): readonly string[] {
  return [...words].sort(compareWordsByDifficulty);
}

function isGridCellInsideBounds(row: number, col: number, gridSide: number): boolean {
  return row >= 0 && row < gridSide && col >= 0 && col < gridSide;
}

function toGridCellIndex(row: number, col: number, gridSide: number): number {
  return row * gridSide + col;
}

export function findWordPathInGrid(
  grid: readonly string[],
  targetWord: string,
): readonly WordGridCellRef[] | null {
  const gridSide = resolveWordGridSideFromLength(grid.length);
  if (targetWord.length === 0 || gridSide === null) {
    return null;
  }

  const path: WordGridCellRef[] = [];
  const visited = new Set<number>();

  const dfs = (row: number, col: number, letterIndex: number): boolean => {
    if (!isGridCellInsideBounds(row, col, gridSide)) {
      return false;
    }

    const cellIndex = toGridCellIndex(row, col, gridSide);
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

    for (const direction of WORD_GRID_DIRECTIONS) {
      if (dfs(row + direction.rowOffset, col + direction.colOffset, letterIndex + 1)) {
        return true;
      }
    }

    path.pop();
    visited.delete(cellIndex);
    return false;
  };

  for (let row = 0; row < gridSide; row += 1) {
    for (let col = 0; col < gridSide; col += 1) {
      if (dfs(row, col, 0)) {
        return [...path];
      }

      path.length = 0;
      visited.clear();
    }
  }

  return null;
}
