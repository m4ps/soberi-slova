import { describe, expect, it } from 'vitest';

import { computeGameLayout } from '../src/adapters/VisualSystem';

describe('render layout contract', () => {
  it('keeps 6x6 grid as a square priority element under top metrics and current-word blocks', () => {
    const layout = computeGameLayout(540, 960);

    expect(layout.grid.width).toBeCloseTo(layout.grid.height, 5);
    expect(layout.grid.width).toBeGreaterThan(layout.controls.height);
    expect(layout.grid.width).toBeGreaterThan(layout.hud.height);
    expect(layout.progressCard.width).toBeCloseTo(layout.scoreCard.width, 5);
    expect(layout.progressCard.height).toBeCloseTo(layout.scoreCard.height, 5);
    expect(layout.currentWord.y).toBeGreaterThanOrEqual(
      layout.metricsRow.y + layout.metricsRow.height,
    );
    expect(layout.grid.y).toBeGreaterThanOrEqual(layout.currentWord.y + layout.currentWord.height);
    expect(layout.controls.y).toBeGreaterThanOrEqual(layout.grid.y + layout.grid.height);
    expect(layout.progressBar.x).toBeGreaterThanOrEqual(layout.progressCard.x);
    expect(layout.progressBar.x + layout.progressBar.width).toBeLessThanOrEqual(
      layout.progressCard.x + layout.progressCard.width,
    );
  });

  it('keeps controls, current word block and grid inside viewport bounds on small screens', () => {
    const layout = computeGameLayout(320, 568);

    expect(layout.grid.x).toBeGreaterThanOrEqual(0);
    expect(layout.grid.y).toBeGreaterThanOrEqual(0);
    expect(layout.grid.x + layout.grid.width).toBeLessThanOrEqual(layout.viewport.width);
    expect(layout.currentWord.x + layout.currentWord.width).toBeLessThanOrEqual(
      layout.viewport.width + 1,
    );
    expect(layout.currentWord.y + layout.currentWord.height).toBeLessThanOrEqual(layout.grid.y + 1);
    expect(layout.controls.y + layout.controls.height).toBeLessThanOrEqual(
      layout.viewport.height + 1,
    );
    expect(layout.buttons.hint.x).toBeGreaterThanOrEqual(layout.controls.x);
    expect(layout.buttons.leaderboard.x + layout.buttons.leaderboard.width).toBeLessThanOrEqual(
      layout.controls.x + layout.controls.width + 1,
    );
  });
});
