import { describe, expect, it } from 'vitest';

import { computeGameLayout } from '../src/shared/game-layout';

describe('render layout contract', () => {
  it('keeps 5x5 grid as a square priority element in portrait viewport', () => {
    const layout = computeGameLayout(540, 960);

    expect(layout.grid.width).toBeCloseTo(layout.grid.height, 5);
    expect(layout.grid.width).toBeGreaterThan(layout.controls.height);
    expect(layout.grid.width).toBeGreaterThan(layout.hud.height);
    expect(layout.grid.y).toBeGreaterThanOrEqual(layout.hud.y + layout.hud.height);
    expect(layout.controls.y).toBeGreaterThanOrEqual(layout.grid.y + layout.grid.height);
  });

  it('keeps controls and grid inside viewport bounds on small screens', () => {
    const layout = computeGameLayout(320, 568);

    expect(layout.grid.x).toBeGreaterThanOrEqual(0);
    expect(layout.grid.y).toBeGreaterThanOrEqual(0);
    expect(layout.grid.x + layout.grid.width).toBeLessThanOrEqual(layout.viewport.width);
    expect(layout.controls.y + layout.controls.height).toBeLessThanOrEqual(
      layout.viewport.height + 1,
    );
    expect(layout.buttons.hint.x).toBeGreaterThanOrEqual(layout.controls.x);
    expect(layout.buttons.leaderboard.x + layout.buttons.leaderboard.width).toBeLessThanOrEqual(
      layout.controls.x + layout.controls.width + 1,
    );
  });
});
