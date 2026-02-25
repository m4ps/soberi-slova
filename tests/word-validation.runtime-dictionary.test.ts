import { describe, expect, it } from 'vitest';

import {
  createRuntimeDictionaryResources,
  createWordValidationModule,
} from '../src/domain/WordValidation';

const RUNTIME_DICTIONARY_FIXTURE_CSV = [
  'id,bare,rank,type,level',
  '1,дом,10,noun,A1',
  '2,тон,20,noun,A1',
  '3,лес,30,noun,A2',
  '4,читать,40,verb,A2',
].join('\n');

describe('WordValidation runtime dictionary resources', () => {
  it('builds dedicated bonus lookup and level-generator entries from CSV index', () => {
    const resources = createRuntimeDictionaryResources(RUNTIME_DICTIONARY_FIXTURE_CSV);

    expect(resources.bonusLookupWords.has('дом')).toBe(true);
    expect(resources.bonusLookupWords.has('тон')).toBe(true);
    expect(resources.bonusLookupWords.has('лес')).toBe(true);
    expect(resources.bonusLookupWords.has('читать')).toBe(false);
    expect(resources.levelGeneratorEntries.map((entry) => entry.normalized)).toEqual([
      'дом',
      'тон',
      'лес',
    ]);
    expect(resources.stats.acceptedRows).toBe(3);
    expect(resources.stats.rejectedRows).toBe(1);
  });

  it('classifies dictionary words as bonus independently from target set', () => {
    const resources = createRuntimeDictionaryResources(RUNTIME_DICTIONARY_FIXTURE_CSV);
    const wordValidation = createWordValidationModule(resources.bonusLookupWords);

    expect(
      wordValidation.validateWord({
        word: 'тон',
        targetWords: ['дом', 'нос', 'сон'],
        foundWords: new Set<string>(),
      }),
    ).toBe('bonus');

    expect(
      wordValidation.validateWord({
        word: 'тон',
        targetWords: ['дом', 'нос', 'сон'],
        foundWords: new Set(['тон']),
      }),
    ).toBe('repeat');
  });
});
