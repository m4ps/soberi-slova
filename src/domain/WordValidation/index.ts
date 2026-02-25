import { MODULE_IDS } from '../../shared/module-ids';
import { isLowercaseCyrillicLetter } from '../data-contract';
import { normalizeDictionaryWord } from './dictionary-pipeline';

export interface WordValidationRequest {
  readonly word: string;
  readonly targetWords: readonly string[];
  readonly foundWords: ReadonlySet<string>;
}

export type WordValidationResult = 'target' | 'bonus' | 'repeat' | 'invalid';

export interface WordPathCellRef {
  readonly row: number;
  readonly col: number;
}

export interface WordValidationPathRequest {
  readonly grid: readonly string[];
  readonly pathCells: readonly WordPathCellRef[];
  readonly targetWords: readonly string[];
  readonly foundTargets: readonly string[];
  readonly foundBonuses: readonly string[];
}

export interface WordValidationPathResult {
  readonly result: WordValidationResult;
  readonly normalizedWord: string | null;
}

export interface WordValidationApplyResult extends WordValidationPathResult {
  readonly nextFoundTargets: readonly string[];
  readonly nextFoundBonuses: readonly string[];
  readonly isSilent: boolean;
}

export interface WordValidationModule {
  readonly moduleName: typeof MODULE_IDS.wordValidation;
  validateWord: (request: WordValidationRequest) => WordValidationResult;
  resolveWordFromPath: (
    grid: readonly string[],
    pathCells: readonly WordPathCellRef[],
  ) => string | null;
  validatePathWord: (request: WordValidationPathRequest) => WordValidationPathResult;
  applyPathWord: (request: WordValidationPathRequest) => WordValidationApplyResult;
}

const GRID_SIDE = 5;
const GRID_CELL_COUNT = GRID_SIDE * GRID_SIDE;

function normalizeWords(words: readonly string[]): readonly string[] {
  return words
    .map((word) => normalizeDictionaryWord(word))
    .filter((word): word is string => {
      return word.length > 0;
    });
}

function createFoundWordsSet(
  foundTargets: readonly string[],
  foundBonuses: readonly string[],
): ReadonlySet<string> {
  return new Set([...normalizeWords(foundTargets), ...normalizeWords(foundBonuses)]);
}

function isInGridBounds(row: number, col: number): boolean {
  return row >= 0 && row < GRID_SIDE && col >= 0 && col < GRID_SIDE;
}

export function resolveWordFromPath(
  grid: readonly string[],
  pathCells: readonly WordPathCellRef[],
): string | null {
  if (!Array.isArray(pathCells) || pathCells.length === 0) {
    return null;
  }

  if (!Array.isArray(grid) || grid.length !== GRID_CELL_COUNT) {
    return null;
  }

  const letters: string[] = [];

  for (const cell of pathCells) {
    if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      return null;
    }

    if (!isInGridBounds(cell.row, cell.col)) {
      return null;
    }

    const cellIndex = cell.row * GRID_SIDE + cell.col;
    const cellLetter = grid[cellIndex];
    if (typeof cellLetter !== 'string') {
      return null;
    }

    const normalizedLetter = normalizeDictionaryWord(cellLetter);
    if (normalizedLetter.length !== 1 || !isLowercaseCyrillicLetter(normalizedLetter)) {
      return null;
    }

    letters.push(normalizedLetter);
  }

  const normalizedWord = normalizeDictionaryWord(letters.join(''));
  return normalizedWord.length > 0 ? normalizedWord : null;
}

function classifyWord(
  dictionary: ReadonlySet<string>,
  request: WordValidationRequest,
): WordValidationResult {
  const normalizedWord = normalizeDictionaryWord(request.word);

  if (!normalizedWord) {
    return 'invalid';
  }

  const normalizedFoundWords = new Set(
    [...request.foundWords]
      .map((word) => normalizeDictionaryWord(word))
      .filter((word): word is string => {
        return word.length > 0;
      }),
  );
  if (normalizedFoundWords.has(normalizedWord)) {
    return 'repeat';
  }

  const normalizedTargetWords = new Set(normalizeWords(request.targetWords));
  if (normalizedTargetWords.has(normalizedWord)) {
    return 'target';
  }

  if (dictionary.has(normalizedWord)) {
    return 'bonus';
  }

  return 'invalid';
}

function validatePathWordWithDictionary(
  dictionary: ReadonlySet<string>,
  request: WordValidationPathRequest,
): WordValidationPathResult {
  const normalizedWord = resolveWordFromPath(request.grid, request.pathCells);
  if (!normalizedWord) {
    return {
      result: 'invalid',
      normalizedWord: null,
    };
  }

  const result = classifyWord(dictionary, {
    word: normalizedWord,
    targetWords: request.targetWords,
    foundWords: createFoundWordsSet(request.foundTargets, request.foundBonuses),
  });

  return {
    result,
    normalizedWord,
  };
}

function toSilentResult(
  result: WordValidationPathResult,
  foundTargets: readonly string[],
  foundBonuses: readonly string[],
): WordValidationApplyResult {
  return {
    ...result,
    nextFoundTargets: foundTargets,
    nextFoundBonuses: foundBonuses,
    isSilent: true,
  };
}

function applyClassifiedWord(
  classification: WordValidationPathResult,
  foundTargets: readonly string[],
  foundBonuses: readonly string[],
): WordValidationApplyResult {
  if (classification.result === 'invalid' || classification.result === 'repeat') {
    return toSilentResult(classification, foundTargets, foundBonuses);
  }

  if (classification.normalizedWord === null) {
    return toSilentResult(
      {
        result: 'invalid',
        normalizedWord: null,
      },
      foundTargets,
      foundBonuses,
    );
  }

  if (classification.result === 'target') {
    return {
      ...classification,
      nextFoundTargets: [...foundTargets, classification.normalizedWord],
      nextFoundBonuses: foundBonuses,
      isSilent: false,
    };
  }

  return {
    ...classification,
    nextFoundTargets: foundTargets,
    nextFoundBonuses: [...foundBonuses, classification.normalizedWord],
    isSilent: false,
  };
}

export function createWordValidationModule(
  dictionary: ReadonlySet<string> = new Set<string>(),
): WordValidationModule {
  const normalizedDictionary = new Set(normalizeWords([...dictionary]));

  return {
    moduleName: MODULE_IDS.wordValidation,
    validateWord: (request) => {
      return classifyWord(normalizedDictionary, request);
    },
    resolveWordFromPath: (grid, pathCells) => {
      return resolveWordFromPath(grid, pathCells);
    },
    validatePathWord: (request) => {
      return validatePathWordWithDictionary(normalizedDictionary, request);
    },
    applyPathWord: (request) => {
      return applyClassifiedWord(
        validatePathWordWithDictionary(normalizedDictionary, request),
        request.foundTargets,
        request.foundBonuses,
      );
    },
  };
}

export {
  buildDictionaryIndexFromCsv,
  DictionaryPipelineError,
  isValidNormalizedDictionaryWord,
  normalizeDictionaryWord,
  type DictionaryCsvPipelineResult,
  type DictionaryIndex,
  type DictionaryPipelineStats,
  type DictionaryRowRejectReason,
} from './dictionary-pipeline';
