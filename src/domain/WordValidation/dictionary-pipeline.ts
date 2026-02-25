import { createWordEntry, type WordEntry } from '../GameState';
import {
  isLowercaseCyrillicWord,
  normalizeCyrillicWord,
  parseFiniteNumberString,
  parseStrictIntegerString,
} from '../data-contract';

const DICTIONARY_REQUIRED_COLUMNS = ['id', 'bare', 'rank', 'type'] as const;
const DICTIONARY_REJECT_REASONS = [
  'malformed-row',
  'invalid-id',
  'invalid-rank',
  'invalid-type',
  'empty-word',
  'not-lowercase',
  'non-cyrillic-word',
  'duplicate-word',
] as const;
const NOUN_WORD_TYPE = 'noun';
const MAX_DICTIONARY_CSV_CHARS = 5_000_000;
const MAX_DICTIONARY_ROW_CHARS = 8_192;
const MAX_DICTIONARY_RANK = Number.MAX_SAFE_INTEGER;
const CSV_HEADER_LINE_INDEX = 0;
const CSV_FIRST_DATA_LINE_INDEX = 1;
const CSV_LINE_INCREMENT = 1;
const CSV_FIELD_SEPARATOR = ',';
const CSV_QUOTE_CHAR = '"';
const COUNTER_INITIAL_VALUE = 0;
const COUNTER_INCREMENT = 1;
const MISSING_COLUMN_INDEX = -1;

type DictionaryRequiredColumn = (typeof DICTIONARY_REQUIRED_COLUMNS)[number];
type RejectCounters = Record<DictionaryRowRejectReason, number>;

interface ParsedCsvRow {
  readonly values: readonly string[];
  readonly malformed: boolean;
}

interface RequiredColumnIndexes {
  readonly id: number;
  readonly bare: number;
  readonly rank: number;
  readonly type: number;
}

interface MutableDictionaryPipelineStats {
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  rejectedByReason: RejectCounters;
}

export type DictionaryRowRejectReason = (typeof DICTIONARY_REJECT_REASONS)[number];

export interface DictionaryPipelineStats {
  readonly totalRows: number;
  readonly acceptedRows: number;
  readonly rejectedRows: number;
  readonly rejectedByReason: Readonly<Record<DictionaryRowRejectReason, number>>;
}

export interface DictionaryIndex {
  readonly size: number;
  readonly normalizedWords: ReadonlySet<string>;
  hasNormalizedWord: (normalizedWord: string) => boolean;
  containsWord: (word: string) => boolean;
  getEntryByNormalizedWord: (normalizedWord: string) => WordEntry | null;
}

export interface DictionaryCsvPipelineResult {
  readonly index: DictionaryIndex;
  readonly stats: DictionaryPipelineStats;
}

export class DictionaryPipelineError extends Error {
  readonly code: string;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, context: Readonly<Record<string, unknown>> = {}) {
    super(`[dictionary-pipeline] ${message}`);
    this.name = 'DictionaryPipelineError';
    this.code = code;
    this.context = context;
  }
}

function parseCsvRow(rawLine: string): ParsedCsvRow {
  const values: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let index = 0; index < rawLine.length; index += CSV_LINE_INCREMENT) {
    const symbol = rawLine[index];

    if (symbol === CSV_QUOTE_CHAR) {
      const nextSymbol = rawLine[index + CSV_LINE_INCREMENT];

      if (inQuotes && nextSymbol === CSV_QUOTE_CHAR) {
        currentValue += CSV_QUOTE_CHAR;
        index += CSV_LINE_INCREMENT;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (symbol === CSV_FIELD_SEPARATOR && !inQuotes) {
      values.push(currentValue);
      currentValue = '';
      continue;
    }

    currentValue += symbol;
  }

  values.push(currentValue);

  return {
    values,
    malformed: inQuotes,
  };
}

function sanitizeCell(rawValue: string): string {
  return rawValue.trim();
}

function normalizeHeaderCell(rawValue: string): string {
  return sanitizeCell(rawValue)
    .replace(/^\uFEFF/u, '')
    .toLowerCase();
}

function createRejectCounters(): RejectCounters {
  return DICTIONARY_REJECT_REASONS.reduce<RejectCounters>((accumulator, rejectReason) => {
    accumulator[rejectReason] = COUNTER_INITIAL_VALUE;
    return accumulator;
  }, {} as RejectCounters);
}

function createMutableStats(): MutableDictionaryPipelineStats {
  return {
    totalRows: COUNTER_INITIAL_VALUE,
    acceptedRows: COUNTER_INITIAL_VALUE,
    rejectedRows: COUNTER_INITIAL_VALUE,
    rejectedByReason: createRejectCounters(),
  };
}

function createReadonlyStats(stats: MutableDictionaryPipelineStats): DictionaryPipelineStats {
  return {
    totalRows: stats.totalRows,
    acceptedRows: stats.acceptedRows,
    rejectedRows: stats.rejectedRows,
    rejectedByReason: { ...stats.rejectedByReason },
  };
}

function registerRejectedRow(
  stats: MutableDictionaryPipelineStats,
  reason: DictionaryRowRejectReason,
): void {
  stats.rejectedRows += COUNTER_INCREMENT;
  stats.rejectedByReason[reason] += COUNTER_INCREMENT;
}

function resolveRequiredColumnIndexes(headerCells: readonly string[]): RequiredColumnIndexes {
  const normalizedHeader = headerCells.map((cell) => normalizeHeaderCell(cell));
  const indexes: Partial<Record<DictionaryRequiredColumn, number>> = {};

  for (const columnName of DICTIONARY_REQUIRED_COLUMNS) {
    indexes[columnName] = normalizedHeader.indexOf(columnName);
  }

  const missingColumns = DICTIONARY_REQUIRED_COLUMNS.filter(
    (columnName) => (indexes[columnName] ?? MISSING_COLUMN_INDEX) < COUNTER_INITIAL_VALUE,
  );

  if (missingColumns.length > 0) {
    throw new DictionaryPipelineError(
      'dictionary-pipeline.missing-columns',
      `CSV header is missing required columns: ${missingColumns.join(', ')}.`,
      { missingColumns },
    );
  }

  return indexes as RequiredColumnIndexes;
}

function getCellValue(cells: readonly string[], columnIndex: number): string | null {
  const value = cells[columnIndex];
  if (value === undefined) {
    return null;
  }

  return sanitizeCell(value);
}

function isValidDictionaryRank(value: number): boolean {
  return value >= 0 && value <= MAX_DICTIONARY_RANK;
}

export function normalizeDictionaryWord(word: string): string {
  return normalizeCyrillicWord(word);
}

export function isValidNormalizedDictionaryWord(word: string): boolean {
  return isLowercaseCyrillicWord(word);
}

export function buildDictionaryIndexFromCsv(csvContent: string): DictionaryCsvPipelineResult {
  if (typeof csvContent !== 'string') {
    throw new DictionaryPipelineError(
      'dictionary-pipeline.invalid-input',
      'CSV content must be a string.',
      { actualType: typeof csvContent },
    );
  }

  if (csvContent.length > MAX_DICTIONARY_CSV_CHARS) {
    throw new DictionaryPipelineError(
      'dictionary-pipeline.csv-too-large',
      `CSV content exceeds ${MAX_DICTIONARY_CSV_CHARS} characters.`,
      {
        actualLength: csvContent.length,
        maxLength: MAX_DICTIONARY_CSV_CHARS,
      },
    );
  }

  if (!csvContent.trim()) {
    throw new DictionaryPipelineError('dictionary-pipeline.empty-csv', 'CSV content is empty.');
  }

  const csvLines = csvContent.split(/\r?\n/u);
  const headerLine = csvLines[CSV_HEADER_LINE_INDEX];

  if (!headerLine || !headerLine.trim()) {
    throw new DictionaryPipelineError('dictionary-pipeline.empty-header', 'CSV header is empty.');
  }

  if (headerLine.length > MAX_DICTIONARY_ROW_CHARS) {
    throw new DictionaryPipelineError(
      'dictionary-pipeline.header-too-large',
      `CSV header exceeds ${MAX_DICTIONARY_ROW_CHARS} characters.`,
      {
        actualLength: headerLine.length,
        maxLength: MAX_DICTIONARY_ROW_CHARS,
      },
    );
  }

  const parsedHeader = parseCsvRow(headerLine);
  if (parsedHeader.malformed) {
    throw new DictionaryPipelineError(
      'dictionary-pipeline.malformed-header',
      'CSV header has malformed quote escaping.',
    );
  }

  const columnIndexes = resolveRequiredColumnIndexes(parsedHeader.values);
  const entriesByNormalizedWord = new Map<string, WordEntry>();
  const stats = createMutableStats();

  for (
    let lineIndex = CSV_FIRST_DATA_LINE_INDEX;
    lineIndex < csvLines.length;
    lineIndex += CSV_LINE_INCREMENT
  ) {
    const rawRow = csvLines[lineIndex];
    if (!rawRow || !rawRow.trim()) {
      continue;
    }

    stats.totalRows += COUNTER_INCREMENT;

    if (rawRow.length > MAX_DICTIONARY_ROW_CHARS) {
      registerRejectedRow(stats, 'malformed-row');
      continue;
    }

    const parsedRow = parseCsvRow(rawRow);
    if (parsedRow.malformed) {
      registerRejectedRow(stats, 'malformed-row');
      continue;
    }

    const idValue = getCellValue(parsedRow.values, columnIndexes.id);
    const bareValue = getCellValue(parsedRow.values, columnIndexes.bare);
    const rankValue = getCellValue(parsedRow.values, columnIndexes.rank);
    const typeValue = getCellValue(parsedRow.values, columnIndexes.type);

    if (idValue === null || bareValue === null || rankValue === null || typeValue === null) {
      registerRejectedRow(stats, 'malformed-row');
      continue;
    }

    const normalizedType = typeValue.toLowerCase();
    if (normalizedType !== NOUN_WORD_TYPE) {
      registerRejectedRow(stats, 'invalid-type');
      continue;
    }

    const entryId = parseStrictIntegerString(idValue);
    if (entryId === null) {
      registerRejectedRow(stats, 'invalid-id');
      continue;
    }

    const entryRank = parseFiniteNumberString(rankValue);
    if (entryRank === null || !isValidDictionaryRank(entryRank)) {
      registerRejectedRow(stats, 'invalid-rank');
      continue;
    }

    if (!bareValue) {
      registerRejectedRow(stats, 'empty-word');
      continue;
    }

    const normalizedWord = normalizeDictionaryWord(bareValue);
    if (bareValue !== normalizedWord) {
      registerRejectedRow(stats, 'not-lowercase');
      continue;
    }

    if (!isValidNormalizedDictionaryWord(normalizedWord)) {
      registerRejectedRow(stats, 'non-cyrillic-word');
      continue;
    }

    if (entriesByNormalizedWord.has(normalizedWord)) {
      registerRejectedRow(stats, 'duplicate-word');
      continue;
    }

    try {
      entriesByNormalizedWord.set(
        normalizedWord,
        createWordEntry({
          id: entryId,
          bare: bareValue,
          rank: entryRank,
          type: NOUN_WORD_TYPE,
          normalized: normalizedWord,
        }),
      );
    } catch {
      registerRejectedRow(stats, 'malformed-row');
      continue;
    }

    stats.acceptedRows += COUNTER_INCREMENT;
  }

  const normalizedWords = new Set(entriesByNormalizedWord.keys());

  return {
    index: {
      size: normalizedWords.size,
      normalizedWords,
      hasNormalizedWord: (normalizedWord) =>
        typeof normalizedWord === 'string' && entriesByNormalizedWord.has(normalizedWord),
      containsWord: (word) =>
        typeof word === 'string' && entriesByNormalizedWord.has(normalizeDictionaryWord(word)),
      getEntryByNormalizedWord: (normalizedWord) =>
        typeof normalizedWord === 'string'
          ? (entriesByNormalizedWord.get(normalizedWord) ?? null)
          : null,
    },
    stats: createReadonlyStats(stats),
  };
}
