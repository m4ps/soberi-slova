import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DictionaryPipelineError, buildDictionaryIndexFromCsv } from '../src/domain/WordValidation';

const TEST_FILE = fileURLToPath(import.meta.url);
const TESTS_DIR = path.dirname(TEST_FILE);
const PROJECT_ROOT = path.resolve(TESTS_DIR, '..');
const DICTIONARY_CSV_PATH = path.join(PROJECT_ROOT, 'data', 'dictionary.csv');

describe('dictionary CSV pipeline', () => {
  it('builds a normalized O(1) index and reports rejected rows by reason', () => {
    const fixtureCsv = [
      'id,bare,rank,type,level',
      '1,дом,10,noun,A1',
      '2,Дом,11,noun,A1',
      '3,до-м,12,noun,A1',
      '4,кот,13,verb,A1',
      'bad,лес,14,noun,A1',
      '6,мир,rank,noun,A1',
      '7,дом,15,noun,A1',
      '8,ёж,16,noun,A1',
      '9,еж,17,noun,A1',
      '10,,18,noun,A1',
      '11,"поле",19,noun,A1',
      '12,"слово,слово",20,noun,A1',
      '13,"ломаная,21,noun,A1',
      '14,крыша,22',
    ].join('\n');

    const result = buildDictionaryIndexFromCsv(fixtureCsv);

    expect(result.index.size).toBe(4);
    expect(result.stats.totalRows).toBe(14);
    expect(result.stats.acceptedRows).toBe(4);
    expect(result.stats.rejectedRows).toBe(10);
    expect(result.stats.rejectedByReason['not-lowercase']).toBe(1);
    expect(result.stats.rejectedByReason['non-cyrillic-word']).toBe(2);
    expect(result.stats.rejectedByReason['invalid-type']).toBe(1);
    expect(result.stats.rejectedByReason['invalid-id']).toBe(1);
    expect(result.stats.rejectedByReason['invalid-rank']).toBe(1);
    expect(result.stats.rejectedByReason['duplicate-word']).toBe(1);
    expect(result.stats.rejectedByReason['empty-word']).toBe(1);
    expect(result.stats.rejectedByReason['malformed-row']).toBe(2);

    expect(result.index.hasNormalizedWord('дом')).toBe(true);
    expect(result.index.hasNormalizedWord('Дом')).toBe(false);
    expect(result.index.containsWord(' дом ')).toBe(true);
    expect(result.index.containsWord('не-слово')).toBe(false);
    expect(result.index.containsWord(123 as unknown as string)).toBe(false);
    expect(result.index.getEntryByNormalizedWord(123 as unknown as string)).toBe(null);
    expect(result.index.getEntryByNormalizedWord('дом')?.id).toBe(1);
    expect(result.index.getEntryByNormalizedWord('еж')?.id).toBe(9);
    expect(result.index.getEntryByNormalizedWord('ёж')?.id).toBe(8);
  });

  it('rejects negative and overflow rank values as invalid-rank without crashing pipeline', () => {
    const fixtureCsv = [
      'id,bare,rank,type',
      '1,дом,10,noun',
      '2,лес,-1,noun',
      `3,мир,${Number.MAX_SAFE_INTEGER + 1},noun`,
    ].join('\n');

    const result = buildDictionaryIndexFromCsv(fixtureCsv);

    expect(result.stats.totalRows).toBe(3);
    expect(result.stats.acceptedRows).toBe(1);
    expect(result.stats.rejectedRows).toBe(2);
    expect(result.stats.rejectedByReason['invalid-rank']).toBe(2);
    expect(result.index.size).toBe(1);
    expect(result.index.hasNormalizedWord('дом')).toBe(true);
    expect(result.index.hasNormalizedWord('лес')).toBe(false);
    expect(result.index.hasNormalizedWord('мир')).toBe(false);
  });

  it('throws a typed error when required CSV columns are missing', () => {
    expect(() => buildDictionaryIndexFromCsv('id,bare,rank\n1,дом,10')).toThrowError(
      DictionaryPipelineError,
    );

    try {
      buildDictionaryIndexFromCsv('id,bare,rank\n1,дом,10');
      throw new Error('Expected buildDictionaryIndexFromCsv to throw.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DictionaryPipelineError);
      if (error instanceof DictionaryPipelineError) {
        expect(error.code).toBe('dictionary-pipeline.missing-columns');
      }
    }
  });

  it('throws a typed error when CSV payload exceeds size guard', () => {
    const oversizedCsv = 'a'.repeat(5_000_001);

    expect(() => buildDictionaryIndexFromCsv(oversizedCsv)).toThrowError(DictionaryPipelineError);

    try {
      buildDictionaryIndexFromCsv(oversizedCsv);
      throw new Error('Expected buildDictionaryIndexFromCsv to throw.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DictionaryPipelineError);
      if (error instanceof DictionaryPipelineError) {
        expect(error.code).toBe('dictionary-pipeline.csv-too-large');
      }
    }
  });

  it('builds index from project dictionary.csv and keeps telemetry stats available', () => {
    const dictionaryCsv = fs.readFileSync(DICTIONARY_CSV_PATH, 'utf8');
    const result = buildDictionaryIndexFromCsv(dictionaryCsv);

    expect(result.stats.totalRows).toBeGreaterThan(0);
    expect(result.stats.acceptedRows + result.stats.rejectedRows).toBe(result.stats.totalRows);
    expect(result.index.size).toBe(result.index.normalizedWords.size);
    expect(result.index.containsWord('дом')).toBe(true);
    expect(result.index.hasNormalizedWord('Дом')).toBe(false);
    expect(result.index.getEntryByNormalizedWord('дом')?.type).toBe('noun');
  });
});
