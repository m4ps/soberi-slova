import { MODULE_IDS } from '../../shared/module-ids';
import type { WordEntry } from '../GameState';
import {
  isLowercaseCyrillicLetter,
  isLowercaseCyrillicWord,
  normalizeCyrillicWord,
} from '../data-contract';

const GRID_SIDE = 5;
const GRID_CELL_COUNT = GRID_SIDE * GRID_SIDE;
const TARGET_WORDS_MIN = 3;
const TARGET_WORDS_MAX = 7;
const SHORT_WORD_MIN_LENGTH = 3;
const SHORT_WORD_MAX_LENGTH = 4;
const MEDIUM_WORD_MIN_LENGTH = 5;
const MEDIUM_WORD_MAX_LENGTH = 6;
const LONG_WORD_MIN_LENGTH = 7;
const MAX_TARGET_WORD_LENGTH = 10;
const DEFAULT_RECENT_WORD_WINDOW_SIZE = 20;
const MAX_LEVEL_GENERATION_ATTEMPTS = 24;
const MAX_WORD_BACKTRACKS = 96;
const RANK_PICK_WINDOW_LIMIT = 64;
const RANK_BIAS_EXPONENT = 1.8;
const RARE_TARGET_RATIO_LIMIT = 0.24;
const RARE_GRID_RATIO_LIMIT = 0.24;
const MAX_RARE_GRID_LETTER_COUNT = 6;
const RANDOM_UINT32_INCREMENT = 0x6d2b79f5;
const UINT32_MAX_PLUS_ONE = 4_294_967_296;
const BASE_FILLER_LETTER = 'а';
const ZERO = 0;
const ONE = 1;

const COMMON_FILLER_LETTERS = 'оеаинтсрвлкмдпубягчзжхцюэфё';
const RARE_LETTERS = new Set(['ъ', 'ы', 'ь', 'й', 'щ']);

const FALLBACK_DICTIONARY_WORDS: ReadonlyArray<Readonly<[word: string, rank: number]>> = [
  ['дом', 10],
  ['сад', 20],
  ['лес', 30],
  ['мир', 40],
  ['путь', 50],
  ['город', 60],
  ['река', 70],
  ['песня', 80],
  ['дорога', 90],
  ['школа', 100],
  ['история', 110],
  ['планета', 120],
  ['карусель', 130],
  ['гостиница', 140],
  ['собрание', 150],
] as const;

export interface LevelGenerationRequest {
  readonly seed: number;
  readonly targetWordCount?: number;
  readonly recentTargetWords?: readonly string[];
}

export interface GeneratedTargetPlacement {
  readonly word: string;
  readonly cellIndexes: readonly number[];
}

export interface GeneratedLevelMeta {
  readonly generationAttempts: number;
  readonly replacements: number;
  readonly backtracks: number;
  readonly rareLetterCount: number;
  readonly rareLetterRatio: number;
}

export interface GeneratedLevel {
  readonly seed: number;
  readonly gridSize: 5;
  readonly grid: readonly string[];
  readonly targetWords: readonly string[];
  readonly placements: readonly GeneratedTargetPlacement[];
  readonly meta: GeneratedLevelMeta;
}

export interface LevelGeneratorOptions {
  readonly dictionaryEntries?: readonly WordEntry[];
  readonly recentWordWindowSize?: number;
}

export interface LevelGeneratorModule {
  readonly moduleName: typeof MODULE_IDS.levelGenerator;
  generateLevel: (request: LevelGenerationRequest) => GeneratedLevel;
}

type WordLengthCategory = 'short' | 'medium' | 'long';

interface DictionaryWordCandidate {
  readonly word: string;
  readonly rank: number;
  readonly category: WordLengthCategory;
  readonly rareLetterCount: number;
}

interface CandidatesByCategory {
  readonly short: readonly DictionaryWordCandidate[];
  readonly medium: readonly DictionaryWordCandidate[];
  readonly long: readonly DictionaryWordCandidate[];
}

interface MutablePlacement {
  readonly word: string;
  readonly path: readonly number[];
}

interface LevelLayoutAttemptResult {
  readonly targetWords: readonly string[];
  readonly placements: readonly MutablePlacement[];
  readonly grid: readonly string[];
  readonly replacements: number;
  readonly backtracks: number;
}

interface RareMetrics {
  readonly rareLetterCount: number;
  readonly rareLetterRatio: number;
}

interface SeededRandom {
  next: () => number;
  nextInt: (minInclusive: number, maxInclusive: number) => number;
  shuffle: <TValue>(values: readonly TValue[]) => TValue[];
}

export class LevelGeneratorDomainError extends Error {
  readonly code: string;
  readonly retryable: false;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, context: Readonly<Record<string, unknown>> = {}) {
    super(`[level-generator] ${message}`);
    this.name = 'LevelGeneratorDomainError';
    this.code = code;
    this.retryable = false;
    this.context = context;
  }
}

function parseError(
  code: string,
  message: string,
  context: Readonly<Record<string, unknown>> = {},
): LevelGeneratorDomainError {
  return new LevelGeneratorDomainError(code, message, context);
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    throw parseError('level-generator.invalid-seed', 'Level seed must be a finite number.', {
      seed,
    });
  }

  return Math.trunc(seed) >>> ZERO;
}

function createSeededRandom(seed: number): SeededRandom {
  let state = normalizeSeed(seed);

  const next = (): number => {
    state = (state + RANDOM_UINT32_INCREMENT) >>> ZERO;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | ONE);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> ZERO) / UINT32_MAX_PLUS_ONE;
  };

  return {
    next,
    nextInt: (minInclusive, maxInclusive) => {
      if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
        throw parseError(
          'level-generator.invalid-random-range',
          'Random integer bounds must be integers.',
          { minInclusive, maxInclusive },
        );
      }

      if (maxInclusive < minInclusive) {
        throw parseError(
          'level-generator.invalid-random-range',
          'Random integer bounds are invalid: max must be >= min.',
          { minInclusive, maxInclusive },
        );
      }

      const span = maxInclusive - minInclusive + ONE;
      return minInclusive + Math.floor(next() * span);
    },
    shuffle: <TValue>(values: readonly TValue[]): TValue[] => {
      const shuffled = [...values];

      for (let index = shuffled.length - ONE; index > ZERO; index -= ONE) {
        const swapIndex = Math.floor(next() * (index + ONE));
        const current = shuffled[index];
        const nextValue = shuffled[swapIndex];

        if (current === undefined || nextValue === undefined) {
          continue;
        }

        shuffled[index] = nextValue;
        shuffled[swapIndex] = current;
      }

      return shuffled;
    },
  };
}

function compareByRankAndWord(
  first: DictionaryWordCandidate,
  second: DictionaryWordCandidate,
): number {
  if (first.rank !== second.rank) {
    return first.rank - second.rank;
  }

  if (first.rareLetterCount !== second.rareLetterCount) {
    return first.rareLetterCount - second.rareLetterCount;
  }

  if (first.word < second.word) {
    return -ONE;
  }

  if (first.word > second.word) {
    return ONE;
  }

  return ZERO;
}

function countRareLetters(value: string): number {
  let rareLetterCount = ZERO;

  for (const letter of value) {
    if (RARE_LETTERS.has(letter)) {
      rareLetterCount += ONE;
    }
  }

  return rareLetterCount;
}

function classifyWordLengthByLength(length: number): WordLengthCategory | null {
  if (length >= SHORT_WORD_MIN_LENGTH && length <= SHORT_WORD_MAX_LENGTH) {
    return 'short';
  }

  if (length >= MEDIUM_WORD_MIN_LENGTH && length <= MEDIUM_WORD_MAX_LENGTH) {
    return 'medium';
  }

  if (length >= LONG_WORD_MIN_LENGTH && length <= MAX_TARGET_WORD_LENGTH) {
    return 'long';
  }

  return null;
}

function classifyWordLength(word: string): WordLengthCategory {
  const category = classifyWordLengthByLength(word.length);

  if (!category) {
    throw parseError(
      'level-generator.invalid-word-length',
      `Word "${word}" does not satisfy generator length rules.`,
      {
        word,
        minLength: SHORT_WORD_MIN_LENGTH,
        maxLength: MAX_TARGET_WORD_LENGTH,
      },
    );
  }

  return category;
}

function normalizeDictionaryEntries(
  entries: readonly WordEntry[],
): readonly DictionaryWordCandidate[] {
  const bestByWord = new Map<string, DictionaryWordCandidate>();

  for (const entry of entries) {
    const normalizedType = entry.type.trim().toLowerCase();
    if (normalizedType !== 'noun') {
      continue;
    }

    if (!Number.isFinite(entry.rank) || entry.rank < ZERO) {
      continue;
    }

    const normalizedWord = normalizeCyrillicWord(entry.normalized);
    if (!isLowercaseCyrillicWord(normalizedWord)) {
      continue;
    }

    const category = classifyWordLengthByLength(normalizedWord.length);
    if (!category) {
      continue;
    }

    const candidate: DictionaryWordCandidate = {
      word: normalizedWord,
      rank: entry.rank,
      category,
      rareLetterCount: countRareLetters(normalizedWord),
    };
    const existing = bestByWord.get(normalizedWord);

    if (!existing || compareByRankAndWord(candidate, existing) < ZERO) {
      bestByWord.set(normalizedWord, candidate);
    }
  }

  return [...bestByWord.values()].sort(compareByRankAndWord);
}

function createFallbackDictionaryCandidates(): readonly DictionaryWordCandidate[] {
  return FALLBACK_DICTIONARY_WORDS.map(([word, rank]) => ({
    word,
    rank,
    category: classifyWordLength(word),
    rareLetterCount: countRareLetters(word),
  })).sort(compareByRankAndWord);
}

const FALLBACK_DICTIONARY_CANDIDATES = createFallbackDictionaryCandidates();

function createDictionaryCandidates(
  options: LevelGeneratorOptions,
): readonly DictionaryWordCandidate[] {
  const normalized = normalizeDictionaryEntries(options.dictionaryEntries ?? []);

  if (normalized.length > ZERO) {
    return normalized;
  }

  return FALLBACK_DICTIONARY_CANDIDATES;
}

function groupDictionaryByCategory(
  dictionary: readonly DictionaryWordCandidate[],
): CandidatesByCategory {
  const grouped: Record<WordLengthCategory, DictionaryWordCandidate[]> = {
    short: [],
    medium: [],
    long: [],
  };

  for (const candidate of dictionary) {
    grouped[candidate.category].push(candidate);
  }

  return {
    short: grouped.short,
    medium: grouped.medium,
    long: grouped.long,
  };
}

function normalizeRecentWordWindowSize(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_RECENT_WORD_WINDOW_SIZE;
  }

  if (!Number.isFinite(value)) {
    throw parseError(
      'level-generator.invalid-recent-window',
      'recentWordWindowSize must be a finite number when provided.',
      { recentWordWindowSize: value },
    );
  }

  const normalized = Math.trunc(value);
  if (normalized <= ZERO) {
    throw parseError(
      'level-generator.invalid-recent-window',
      'recentWordWindowSize must be a positive integer.',
      { recentWordWindowSize: value },
    );
  }

  return normalized;
}

function normalizeRecentWords(
  recentTargetWords: readonly string[] | undefined,
  windowSize: number,
): ReadonlySet<string> {
  if (!recentTargetWords || recentTargetWords.length === ZERO) {
    return new Set<string>();
  }

  const normalizedWords: string[] = [];

  for (const rawWord of recentTargetWords) {
    const normalizedWord = normalizeCyrillicWord(rawWord);
    if (!isLowercaseCyrillicWord(normalizedWord)) {
      continue;
    }

    normalizedWords.push(normalizedWord);
  }

  return new Set(normalizedWords.slice(-windowSize));
}

function resolveTargetWordCount(targetWordCount: number | undefined, random: SeededRandom): number {
  if (targetWordCount === undefined) {
    return random.nextInt(TARGET_WORDS_MIN, TARGET_WORDS_MAX);
  }

  if (!Number.isFinite(targetWordCount)) {
    throw parseError(
      'level-generator.invalid-target-count',
      'targetWordCount must be a finite number when provided.',
      { targetWordCount },
    );
  }

  const normalized = Math.trunc(targetWordCount);
  if (normalized < TARGET_WORDS_MIN) {
    return TARGET_WORDS_MIN;
  }

  if (normalized > TARGET_WORDS_MAX) {
    return TARGET_WORDS_MAX;
  }

  return normalized;
}

function assertDictionaryCoverage(
  groupedCandidates: CandidatesByCategory,
  targetWordCount: number,
): void {
  const missingCategories: WordLengthCategory[] = [];

  for (const category of ['short', 'medium', 'long'] as const) {
    if (groupedCandidates[category].length === ZERO) {
      missingCategories.push(category);
    }
  }

  if (missingCategories.length > ZERO) {
    throw parseError(
      'level-generator.missing-word-category',
      'Dictionary does not contain enough words for required short/medium/long composition.',
      {
        missingCategories,
      },
    );
  }

  const totalUniqueWords =
    groupedCandidates.short.length +
    groupedCandidates.medium.length +
    groupedCandidates.long.length;

  if (totalUniqueWords < targetWordCount) {
    throw parseError(
      'level-generator.dictionary-too-small',
      'Dictionary does not contain enough unique words to satisfy requested target count.',
      {
        targetWordCount,
        totalUniqueWords,
      },
    );
  }
}

function pickCandidateByRank(
  candidates: readonly DictionaryWordCandidate[],
  excludedWords: ReadonlySet<string>,
  recentWords: ReadonlySet<string>,
  random: SeededRandom,
): DictionaryWordCandidate | null {
  const preferredPool: DictionaryWordCandidate[] = [];
  const fallbackPool: DictionaryWordCandidate[] = [];

  for (const candidate of candidates) {
    if (excludedWords.has(candidate.word)) {
      continue;
    }

    if (recentWords.has(candidate.word)) {
      fallbackPool.push(candidate);
      continue;
    }

    preferredPool.push(candidate);
  }

  const pool = preferredPool.length > ZERO ? preferredPool : fallbackPool;
  if (pool.length === ZERO) {
    return null;
  }

  const pickWindow = Math.min(pool.length, RANK_PICK_WINDOW_LIMIT);
  const rawIndex = Math.floor(Math.pow(random.next(), RANK_BIAS_EXPONENT) * pickWindow);
  const safeIndex = Math.min(rawIndex, pickWindow - ONE);
  return pool[safeIndex] ?? null;
}

function uniqueCategoryOrder(order: readonly WordLengthCategory[]): WordLengthCategory[] {
  const seen = new Set<WordLengthCategory>();
  const result: WordLengthCategory[] = [];

  for (const category of order) {
    if (seen.has(category)) {
      continue;
    }

    seen.add(category);
    result.push(category);
  }

  return result;
}

function pickCandidateForCategories(
  categoryOrder: readonly WordLengthCategory[],
  groupedCandidates: CandidatesByCategory,
  excludedWords: ReadonlySet<string>,
  recentWords: ReadonlySet<string>,
  random: SeededRandom,
): DictionaryWordCandidate | null {
  for (const category of uniqueCategoryOrder(categoryOrder)) {
    const candidate = pickCandidateByRank(
      groupedCandidates[category],
      excludedWords,
      recentWords,
      random,
    );

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function pickExtraCategory(random: SeededRandom): WordLengthCategory {
  const roll = random.next();

  if (roll < 0.5) {
    return 'medium';
  }

  if (roll < 0.8) {
    return 'short';
  }

  return 'long';
}

function selectInitialTargetWords(
  targetWordCount: number,
  groupedCandidates: CandidatesByCategory,
  recentWords: ReadonlySet<string>,
  random: SeededRandom,
): readonly string[] {
  const selectedWords: string[] = [];
  const selectedSet = new Set<string>();

  for (const mandatoryCategory of ['short', 'medium', 'long'] as const) {
    const candidate = pickCandidateForCategories(
      [mandatoryCategory],
      groupedCandidates,
      selectedSet,
      recentWords,
      random,
    );

    if (!candidate) {
      throw parseError(
        'level-generator.selection-failed',
        'Unable to select mandatory word category for level generation.',
        { mandatoryCategory, selectedWords },
      );
    }

    selectedWords.push(candidate.word);
    selectedSet.add(candidate.word);
  }

  while (selectedWords.length < targetWordCount) {
    const preferredCategory = pickExtraCategory(random);
    const candidate = pickCandidateForCategories(
      [preferredCategory, 'medium', 'short', 'long'],
      groupedCandidates,
      selectedSet,
      recentWords,
      random,
    );

    if (!candidate) {
      throw parseError(
        'level-generator.selection-failed',
        'Unable to select enough unique target words.',
        {
          selectedWords,
          targetWordCount,
        },
      );
    }

    selectedWords.push(candidate.word);
    selectedSet.add(candidate.word);
  }

  return random.shuffle(selectedWords);
}

function calculateRareMetrics(value: string): RareMetrics {
  if (!value) {
    return {
      rareLetterCount: ZERO,
      rareLetterRatio: ZERO,
    };
  }

  const rareLetterCount = countRareLetters(value);
  return {
    rareLetterCount,
    rareLetterRatio: rareLetterCount / value.length,
  };
}

function isTargetSetRejectedByRareLetters(targetWords: readonly string[]): boolean {
  const metrics = calculateRareMetrics(targetWords.join(''));
  return metrics.rareLetterRatio > RARE_TARGET_RATIO_LIMIT;
}

function isGridRejectedByRareLetters(grid: readonly string[]): boolean {
  const metrics = calculateRareMetrics(grid.join(''));

  return (
    metrics.rareLetterCount > MAX_RARE_GRID_LETTER_COUNT ||
    metrics.rareLetterRatio > RARE_GRID_RATIO_LIMIT
  );
}

function createFillerPool(targetWords: readonly string[]): readonly string[] {
  const pool = [...COMMON_FILLER_LETTERS];

  for (const word of targetWords) {
    for (const letter of word) {
      if (!RARE_LETTERS.has(letter)) {
        pool.push(letter);
      }
    }
  }

  if (pool.length === ZERO) {
    return [BASE_FILLER_LETTER];
  }

  return pool;
}

function fillGrid(
  gridWithHoles: readonly (string | null)[],
  targetWords: readonly string[],
  random: SeededRandom,
): readonly string[] {
  const fillerPool = createFillerPool(targetWords);
  const result: string[] = [];

  for (const cell of gridWithHoles) {
    if (cell !== null) {
      result.push(cell);
      continue;
    }

    const fillerIndex = Math.floor(random.next() * fillerPool.length);
    result.push(fillerPool[fillerIndex] ?? BASE_FILLER_LETTER);
  }

  return result;
}

function getWordLetter(word: string, index: number): string {
  const letter = word[index];

  if (!letter) {
    throw parseError(
      'level-generator.invalid-word-letter',
      `Word "${word}" does not contain a letter at index ${index}.`,
      { word, index },
    );
  }

  return letter;
}

function buildNeighborTable(): readonly (readonly number[])[] {
  const table: number[][] = [];

  for (let cellIndex = ZERO; cellIndex < GRID_CELL_COUNT; cellIndex += ONE) {
    const row = Math.floor(cellIndex / GRID_SIDE);
    const col = cellIndex % GRID_SIDE;
    const neighbors: number[] = [];

    for (let rowShift = -ONE; rowShift <= ONE; rowShift += ONE) {
      for (let colShift = -ONE; colShift <= ONE; colShift += ONE) {
        if (rowShift === ZERO && colShift === ZERO) {
          continue;
        }

        const nextRow = row + rowShift;
        const nextCol = col + colShift;

        if (nextRow < ZERO || nextRow >= GRID_SIDE || nextCol < ZERO || nextCol >= GRID_SIDE) {
          continue;
        }

        neighbors.push(nextRow * GRID_SIDE + nextCol);
      }
    }

    table.push(neighbors);
  }

  return table;
}

const NEIGHBOR_TABLE = buildNeighborTable();

function tryExtendPath(
  word: string,
  letterIndex: number,
  currentCell: number,
  path: number[],
  visited: boolean[],
  grid: readonly (string | null)[],
  random: SeededRandom,
): boolean {
  if (letterIndex >= word.length) {
    return true;
  }

  const expectedLetter = getWordLetter(word, letterIndex);
  const neighbors = random.shuffle(NEIGHBOR_TABLE[currentCell] ?? []);

  for (const neighborCell of neighbors) {
    if (visited[neighborCell]) {
      continue;
    }

    const gridLetter = grid[neighborCell];
    if (gridLetter !== null && gridLetter !== expectedLetter) {
      continue;
    }

    visited[neighborCell] = true;
    path.push(neighborCell);

    if (tryExtendPath(word, letterIndex + ONE, neighborCell, path, visited, grid, random)) {
      return true;
    }

    path.pop();
    visited[neighborCell] = false;
  }

  return false;
}

function findPlacementPath(
  word: string,
  grid: readonly (string | null)[],
  random: SeededRandom,
): readonly number[] | null {
  const firstLetter = getWordLetter(word, ZERO);
  const startCandidates: number[] = [];

  for (let cellIndex = ZERO; cellIndex < GRID_CELL_COUNT; cellIndex += ONE) {
    const gridLetter = grid[cellIndex];
    if (gridLetter === null || gridLetter === firstLetter) {
      startCandidates.push(cellIndex);
    }
  }

  for (const startCell of random.shuffle(startCandidates)) {
    const path = [startCell];
    const visited = new Array<boolean>(GRID_CELL_COUNT).fill(false);
    visited[startCell] = true;

    if (tryExtendPath(word, ONE, startCell, path, visited, grid, random)) {
      return [...path];
    }
  }

  return null;
}

function applyPlacement(
  word: string,
  path: readonly number[],
  grid: (string | null)[],
  usageCounter: number[],
): void {
  for (let letterIndex = ZERO; letterIndex < path.length; letterIndex += ONE) {
    const cellIndex = path[letterIndex];

    if (cellIndex === undefined) {
      throw parseError(
        'level-generator.invalid-path',
        'Placement path contains an invalid cell index.',
        { word, path },
      );
    }

    const wordLetter = getWordLetter(word, letterIndex);
    const gridLetter = grid[cellIndex];

    if (gridLetter !== null && gridLetter !== wordLetter) {
      throw parseError(
        'level-generator.path-conflict',
        'Placement path conflicts with existing grid letters.',
        { word, path, cellIndex, gridLetter, wordLetter },
      );
    }

    const usage = usageCounter[cellIndex];
    if (usage === undefined) {
      throw parseError(
        'level-generator.invalid-path',
        'Placement path contains an out-of-bounds cell index.',
        { word, path, cellIndex },
      );
    }

    grid[cellIndex] = wordLetter;
    usageCounter[cellIndex] = usage + ONE;
  }
}

function removePlacement(
  path: readonly number[],
  grid: (string | null)[],
  usageCounter: number[],
): void {
  for (const cellIndex of path) {
    const usage = usageCounter[cellIndex];

    if (usage === undefined || usage <= ZERO) {
      throw parseError(
        'level-generator.invalid-path-rollback',
        'Failed to rollback placement due to invalid usage state.',
        { path, cellIndex, usage },
      );
    }

    const nextUsage = usage - ONE;
    usageCounter[cellIndex] = nextUsage;

    if (nextUsage === ZERO) {
      grid[cellIndex] = null;
    }
  }
}

function countWordComposition(words: readonly string[]): Record<WordLengthCategory, number> {
  const counts: Record<WordLengthCategory, number> = {
    short: ZERO,
    medium: ZERO,
    long: ZERO,
  };

  for (const word of words) {
    const category = classifyWordLength(word);
    counts[category] += ONE;
  }

  return counts;
}

function getReplacementCategoryOrder(
  failedCategory: WordLengthCategory,
  composition: Record<WordLengthCategory, number>,
): readonly WordLengthCategory[] {
  if (failedCategory === 'short' && composition.short <= ONE) {
    return ['short'];
  }

  if (failedCategory === 'medium' && composition.medium <= ONE) {
    return ['medium'];
  }

  if (failedCategory === 'long' && composition.long <= ONE) {
    return ['long'];
  }

  return [failedCategory, 'medium', 'short', 'long'];
}

function tryGenerateLayout(
  initialWords: readonly string[],
  groupedCandidates: CandidatesByCategory,
  recentWords: ReadonlySet<string>,
  random: SeededRandom,
): LevelLayoutAttemptResult | null {
  const workingWords = [...initialWords];
  const placements: Array<MutablePlacement | null> = new Array(workingWords.length).fill(null);
  const attemptedWordsByIndex: Array<Set<string>> = Array.from(
    { length: workingWords.length },
    () => new Set<string>(),
  );
  const grid: Array<string | null> = new Array(GRID_CELL_COUNT).fill(null);
  const usageCounter = new Array<number>(GRID_CELL_COUNT).fill(ZERO);
  let replacements = ZERO;
  let backtracks = ZERO;
  let wordIndex = ZERO;

  while (wordIndex < workingWords.length) {
    const word = workingWords[wordIndex];
    if (!word) {
      return null;
    }

    attemptedWordsByIndex[wordIndex]?.add(word);

    const path = findPlacementPath(word, grid, random);
    if (path) {
      applyPlacement(word, path, grid, usageCounter);
      placements[wordIndex] = { word, path };
      wordIndex += ONE;
      continue;
    }

    const excludedWords = new Set<string>();

    for (const [currentIndex, currentWord] of workingWords.entries()) {
      if (currentIndex !== wordIndex) {
        excludedWords.add(currentWord);
      }
    }

    for (const attemptedWord of attemptedWordsByIndex[wordIndex] ?? []) {
      excludedWords.add(attemptedWord);
    }

    const failedCategory = classifyWordLength(word);
    const composition = countWordComposition(workingWords);
    const replacementCategoryOrder = getReplacementCategoryOrder(failedCategory, composition);
    const replacement = pickCandidateForCategories(
      replacementCategoryOrder,
      groupedCandidates,
      excludedWords,
      recentWords,
      random,
    );

    if (replacement) {
      workingWords[wordIndex] = replacement.word;
      replacements += ONE;
      continue;
    }

    attemptedWordsByIndex[wordIndex]?.clear();

    if (wordIndex === ZERO) {
      return null;
    }

    wordIndex -= ONE;

    const previousPlacement = placements[wordIndex];
    if (!previousPlacement) {
      return null;
    }

    removePlacement(previousPlacement.path, grid, usageCounter);
    placements[wordIndex] = null;
    backtracks += ONE;

    if (backtracks > MAX_WORD_BACKTRACKS) {
      return null;
    }
  }

  const finalizedPlacements: MutablePlacement[] = [];

  for (const placement of placements) {
    if (!placement) {
      return null;
    }

    finalizedPlacements.push({
      word: placement.word,
      path: [...placement.path],
    });
  }

  const targetWords = finalizedPlacements.map((placement) => placement.word);
  const filledGrid = fillGrid(grid, targetWords, random);

  return {
    targetWords,
    placements: finalizedPlacements,
    grid: filledGrid,
    replacements,
    backtracks,
  };
}

function isValidPlacementPath(path: readonly number[]): boolean {
  if (path.length === ZERO) {
    return false;
  }

  const usedCells = new Set<number>();

  for (let index = ZERO; index < path.length; index += ONE) {
    const currentCell = path[index];
    if (
      currentCell === undefined ||
      !Number.isInteger(currentCell) ||
      currentCell < ZERO ||
      currentCell >= GRID_CELL_COUNT
    ) {
      return false;
    }

    if (usedCells.has(currentCell)) {
      return false;
    }

    usedCells.add(currentCell);

    if (index === ZERO) {
      continue;
    }

    const previousCell = path[index - ONE];
    if (previousCell === undefined) {
      return false;
    }

    const currentRow = Math.floor(currentCell / GRID_SIDE);
    const currentCol = currentCell % GRID_SIDE;
    const previousRow = Math.floor(previousCell / GRID_SIDE);
    const previousCol = previousCell % GRID_SIDE;
    const rowDelta = Math.abs(currentRow - previousRow);
    const colDelta = Math.abs(currentCol - previousCol);

    if (rowDelta > ONE || colDelta > ONE || (rowDelta === ZERO && colDelta === ZERO)) {
      return false;
    }
  }

  return true;
}

function assertGeneratedLevel(level: GeneratedLevel): void {
  if (level.grid.length !== GRID_CELL_COUNT) {
    throw parseError(
      'level-generator.invalid-grid-size',
      `Generated grid must contain ${GRID_CELL_COUNT} cells.`,
      { actual: level.grid.length },
    );
  }

  for (const [index, cell] of level.grid.entries()) {
    if (!isLowercaseCyrillicLetter(cell)) {
      throw parseError(
        'level-generator.invalid-grid-cell',
        'Generated grid cell is not a lowercase Cyrillic letter.',
        { cell, index },
      );
    }
  }

  if (level.targetWords.length < TARGET_WORDS_MIN || level.targetWords.length > TARGET_WORDS_MAX) {
    throw parseError(
      'level-generator.invalid-target-count',
      'Generated target word count is outside supported range 3..7.',
      {
        targetWordCount: level.targetWords.length,
      },
    );
  }

  const uniqueWords = new Set(level.targetWords);
  if (uniqueWords.size !== level.targetWords.length) {
    throw parseError(
      'level-generator.duplicate-target-word',
      'Generated target words must be unique within a level.',
      {
        targetWords: level.targetWords,
      },
    );
  }

  if (!level.targetWords.some((word) => word.length >= LONG_WORD_MIN_LENGTH)) {
    throw parseError(
      'level-generator.missing-long-word',
      'Generated level must include at least one long target word.',
      {
        targetWords: level.targetWords,
      },
    );
  }

  if (level.placements.length !== level.targetWords.length) {
    throw parseError(
      'level-generator.invalid-placements',
      'Generated placements length must match target words length.',
      {
        placements: level.placements.length,
        targetWords: level.targetWords.length,
      },
    );
  }

  for (const [index, placement] of level.placements.entries()) {
    const expectedWord = level.targetWords[index];
    if (!expectedWord || placement.word !== expectedWord) {
      throw parseError(
        'level-generator.invalid-placement-word',
        'Generated placement word does not match target words order.',
        {
          placementWord: placement.word,
          expectedWord,
          index,
        },
      );
    }

    if (!isValidPlacementPath(placement.cellIndexes)) {
      throw parseError(
        'level-generator.invalid-placement-path',
        'Generated placement path is not valid.',
        {
          word: placement.word,
          cellIndexes: placement.cellIndexes,
        },
      );
    }

    if (placement.cellIndexes.length !== placement.word.length) {
      throw parseError(
        'level-generator.invalid-placement-length',
        'Generated placement length must match word length.',
        {
          word: placement.word,
          wordLength: placement.word.length,
          placementLength: placement.cellIndexes.length,
        },
      );
    }

    for (let letterIndex = ZERO; letterIndex < placement.cellIndexes.length; letterIndex += ONE) {
      const cellIndex = placement.cellIndexes[letterIndex];
      if (cellIndex === undefined) {
        throw parseError(
          'level-generator.invalid-placement-index',
          'Generated placement contains undefined cell index.',
          {
            word: placement.word,
            letterIndex,
            cellIndexes: placement.cellIndexes,
          },
        );
      }

      const gridLetter = level.grid[cellIndex];
      const wordLetter = getWordLetter(placement.word, letterIndex);

      if (gridLetter !== wordLetter) {
        throw parseError(
          'level-generator.invalid-placement-grid-letter',
          'Generated placement letter does not match grid.',
          {
            word: placement.word,
            cellIndex,
            letterIndex,
            expectedLetter: wordLetter,
            actualLetter: gridLetter,
          },
        );
      }
    }
  }
}

export function createLevelGeneratorModule(
  options: LevelGeneratorOptions = {},
): LevelGeneratorModule {
  const dictionaryCandidates = createDictionaryCandidates(options);
  const groupedCandidates = groupDictionaryByCategory(dictionaryCandidates);
  const recentWordWindowSize = normalizeRecentWordWindowSize(options.recentWordWindowSize);

  return {
    moduleName: MODULE_IDS.levelGenerator,
    generateLevel: (request) => {
      const normalizedSeed = normalizeSeed(request.seed);
      const random = createSeededRandom(normalizedSeed);
      const targetWordCount = resolveTargetWordCount(request.targetWordCount, random);
      const recentWords = normalizeRecentWords(request.recentTargetWords, recentWordWindowSize);

      assertDictionaryCoverage(groupedCandidates, targetWordCount);

      for (
        let generationAttempt = ONE;
        generationAttempt <= MAX_LEVEL_GENERATION_ATTEMPTS;
        generationAttempt += ONE
      ) {
        const initialWords = selectInitialTargetWords(
          targetWordCount,
          groupedCandidates,
          recentWords,
          random,
        );

        if (isTargetSetRejectedByRareLetters(initialWords)) {
          continue;
        }

        const layoutAttempt = tryGenerateLayout(
          initialWords,
          groupedCandidates,
          recentWords,
          random,
        );
        if (!layoutAttempt) {
          continue;
        }

        if (isTargetSetRejectedByRareLetters(layoutAttempt.targetWords)) {
          continue;
        }

        if (isGridRejectedByRareLetters(layoutAttempt.grid)) {
          continue;
        }

        const rareMetrics = calculateRareMetrics(layoutAttempt.grid.join(''));
        const generatedLevel: GeneratedLevel = {
          seed: normalizedSeed,
          gridSize: GRID_SIDE,
          grid: layoutAttempt.grid,
          targetWords: layoutAttempt.targetWords,
          placements: layoutAttempt.placements.map((placement) => ({
            word: placement.word,
            cellIndexes: [...placement.path],
          })),
          meta: {
            generationAttempts: generationAttempt,
            replacements: layoutAttempt.replacements,
            backtracks: layoutAttempt.backtracks,
            rareLetterCount: rareMetrics.rareLetterCount,
            rareLetterRatio: rareMetrics.rareLetterRatio,
          },
        };

        assertGeneratedLevel(generatedLevel);
        return generatedLevel;
      }

      throw parseError(
        'level-generator.generation-failed',
        'Failed to generate a valid level after maximum retry attempts.',
        {
          seed: normalizedSeed,
          targetWordCount,
          maxAttempts: MAX_LEVEL_GENERATION_ATTEMPTS,
        },
      );
    },
  };
}
