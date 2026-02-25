import { describe, expect, it } from 'vitest';

import {
  isLengthInRange,
  isLowercaseCyrillicLetter,
  isLowercaseCyrillicWord,
  normalizeCyrillicWord,
  parseFiniteNumberString,
  parseStrictIntegerString,
} from '../src/domain/data-contract';

describe('data contract helpers', () => {
  it('normalizes words and keeps e/yo distinction', () => {
    expect(normalizeCyrillicWord('  Ёж  ')).toBe('ёж');
    expect(normalizeCyrillicWord('Еж')).toBe('еж');
    expect(normalizeCyrillicWord('  дом ')).toBe('дом');
  });

  it('validates lowercase cyrillic words and single letters', () => {
    expect(isLowercaseCyrillicWord('слово')).toBe(true);
    expect(isLowercaseCyrillicWord('слово-1')).toBe(false);
    expect(isLowercaseCyrillicWord('Слово')).toBe(false);

    expect(isLowercaseCyrillicLetter('ё')).toBe(true);
    expect(isLowercaseCyrillicLetter('е')).toBe(true);
    expect(isLowercaseCyrillicLetter('сл')).toBe(false);
    expect(isLowercaseCyrillicLetter('A')).toBe(false);
  });

  it('checks length ranges and parses numeric csv values', () => {
    expect(isLengthInRange(3, 3, 7)).toBe(true);
    expect(isLengthInRange(7, 3, 7)).toBe(true);
    expect(isLengthInRange(2, 3, 7)).toBe(false);

    expect(parseStrictIntegerString('42')).toBe(42);
    expect(parseStrictIntegerString('42.5')).toBeNull();
    expect(parseStrictIntegerString('-1')).toBeNull();
    expect(parseStrictIntegerString('abc')).toBeNull();

    expect(parseFiniteNumberString('17')).toBe(17);
    expect(parseFiniteNumberString('17.5')).toBe(17.5);
    expect(parseFiniteNumberString('')).toBeNull();
    expect(parseFiniteNumberString('Infinity')).toBeNull();
  });
});
