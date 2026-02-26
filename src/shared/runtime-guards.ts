export function isRecordLike(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

export function parseNonNegativeSafeInteger(value: unknown): number | null {
  if (typeof value !== 'number') {
    return null;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    return null;
  }

  return Math.trunc(value);
}
