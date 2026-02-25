import { createWordEntry, type WordEntry } from '../GameState';

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
const CYRILLIC_WORD_PATTERN = /^[а-яё]+$/u;
const NOUN_WORD_TYPE = 'noun';

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

  for (let index = 0; index < rawLine.length; index += 1) {
    const symbol = rawLine[index];

    if (symbol === '"') {
      const nextSymbol = rawLine[index + 1];

      if (inQuotes && nextSymbol === '"') {
        currentValue += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (symbol === ',' && !inQuotes) {
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
    accumulator[rejectReason] = 0;
    return accumulator;
  }, {} as RejectCounters);
}

function createMutableStats(): MutableDictionaryPipelineStats {
  return {
    totalRows: 0,
    acceptedRows: 0,
    rejectedRows: 0,
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
  stats.rejectedRows += 1;
  stats.rejectedByReason[reason] += 1;
}

function parseStrictInteger(rawValue: string): number | null {
  if (!/^\d+$/u.test(rawValue)) {
    return null;
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) {
    return null;
  }

  return value;
}

function parseFiniteNumber(rawValue: string): number | null {
  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

function resolveRequiredColumnIndexes(headerCells: readonly string[]): RequiredColumnIndexes {
  const normalizedHeader = headerCells.map((cell) => normalizeHeaderCell(cell));
  const indexes: Partial<Record<DictionaryRequiredColumn, number>> = {};

  for (const columnName of DICTIONARY_REQUIRED_COLUMNS) {
    indexes[columnName] = normalizedHeader.indexOf(columnName);
  }

  const missingColumns = DICTIONARY_REQUIRED_COLUMNS.filter(
    (columnName) => (indexes[columnName] ?? -1) < 0,
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

export function normalizeDictionaryWord(word: string): string {
  return word.trim().toLowerCase();
}

export function isValidNormalizedDictionaryWord(word: string): boolean {
  return CYRILLIC_WORD_PATTERN.test(word);
}

export function buildDictionaryIndexFromCsv(csvContent: string): DictionaryCsvPipelineResult {
  if (!csvContent.trim()) {
    throw new DictionaryPipelineError('dictionary-pipeline.empty-csv', 'CSV content is empty.');
  }

  const csvLines = csvContent.split(/\r?\n/u);
  const headerLine = csvLines[0];

  if (!headerLine || !headerLine.trim()) {
    throw new DictionaryPipelineError('dictionary-pipeline.empty-header', 'CSV header is empty.');
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

  for (let lineIndex = 1; lineIndex < csvLines.length; lineIndex += 1) {
    const rawRow = csvLines[lineIndex];
    if (!rawRow || !rawRow.trim()) {
      continue;
    }

    stats.totalRows += 1;

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

    const entryId = parseStrictInteger(idValue);
    if (entryId === null) {
      registerRejectedRow(stats, 'invalid-id');
      continue;
    }

    const entryRank = parseFiniteNumber(rankValue);
    if (entryRank === null) {
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
    stats.acceptedRows += 1;
  }

  const normalizedWords = new Set(entriesByNormalizedWord.keys());

  return {
    index: {
      size: normalizedWords.size,
      normalizedWords,
      hasNormalizedWord: (normalizedWord) => entriesByNormalizedWord.has(normalizedWord),
      containsWord: (word) => entriesByNormalizedWord.has(normalizeDictionaryWord(word)),
      getEntryByNormalizedWord: (normalizedWord) =>
        entriesByNormalizedWord.get(normalizedWord) ?? null,
    },
    stats: createReadonlyStats(stats),
  };
}
