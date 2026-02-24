import { describe, expect, it } from 'vitest';

import { GAME_VIEWPORT } from '../src/config/viewport';

describe('bootstrap viewport contract', () => {
  it('uses portrait orientation for mobile-first runtime', () => {
    expect(GAME_VIEWPORT.height).toBeGreaterThan(GAME_VIEWPORT.width);
    expect(GAME_VIEWPORT.aspectRatio).toBeCloseTo(9 / 16, 5);
  });
});
