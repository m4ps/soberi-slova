import { describe, expect, it } from 'vitest';

import { isRecordLike, parseNonNegativeSafeInteger } from '../src/shared/runtime-guards';

describe('shared runtime guards', () => {
  it('parses non-negative safe integers only', () => {
    expect(parseNonNegativeSafeInteger(0)).toBe(0);
    expect(parseNonNegativeSafeInteger(42)).toBe(42);
    expect(parseNonNegativeSafeInteger(42.7)).toBeNull();
    expect(parseNonNegativeSafeInteger(-1)).toBeNull();
    expect(parseNonNegativeSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
    expect(parseNonNegativeSafeInteger('42')).toBeNull();
  });

  it('detects plain record-like values', () => {
    expect(isRecordLike({ key: 'value' })).toBe(true);
    expect(isRecordLike(null)).toBe(false);
    expect(isRecordLike('text')).toBe(false);
    expect(isRecordLike(5)).toBe(false);
  });
});
