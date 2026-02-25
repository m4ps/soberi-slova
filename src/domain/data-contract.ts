const LOWERCASE_CYRILLIC_WORD_PATTERN = /^[а-яё]+$/u;
const LOWERCASE_CYRILLIC_LETTER_PATTERN = /^[а-яё]$/u;
const STRICT_INTEGER_PATTERN = /^\d+$/u;

export function normalizeCyrillicWord(value: string): string {
  return value.trim().toLowerCase();
}

export function isLowercaseCyrillicWord(value: string): boolean {
  return LOWERCASE_CYRILLIC_WORD_PATTERN.test(value);
}

export function isLowercaseCyrillicLetter(value: string): boolean {
  return LOWERCASE_CYRILLIC_LETTER_PATTERN.test(value);
}

export function isLengthInRange(length: number, min: number, max: number): boolean {
  return length >= min && length <= max;
}

export function parseStrictIntegerString(value: string): number | null {
  if (!STRICT_INTEGER_PATTERN.test(value)) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return parsed;
}

export function parseFiniteNumberString(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}
