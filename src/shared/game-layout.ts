export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutPoint {
  readonly x: number;
  readonly y: number;
}

export interface GameLayout {
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
  readonly hud: LayoutRect;
  readonly grid: LayoutRect;
  readonly controls: LayoutRect;
  readonly buttons: {
    readonly hint: LayoutRect;
    readonly reshuffle: LayoutRect;
    readonly leaderboard: LayoutRect;
  };
  readonly progressAnchor: LayoutPoint;
  readonly scoreAnchor: LayoutPoint;
}

const MIN_DIMENSION = 1;
const MIN_GRID_SIZE = 180;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeViewportDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_DIMENSION;
  }

  return Math.max(MIN_DIMENSION, value);
}

export function computeGameLayout(
  viewportWidthInput: number,
  viewportHeightInput: number,
): GameLayout {
  const viewportWidth = normalizeViewportDimension(viewportWidthInput);
  const viewportHeight = normalizeViewportDimension(viewportHeightInput);

  const horizontalPadding = clamp(viewportWidth * 0.06, 14, 28);
  const verticalPadding = clamp(viewportHeight * 0.02, 10, 24);
  let hudHeight = clamp(viewportHeight * 0.11, 72, 128);
  let controlsHeight = clamp(viewportHeight * 0.19, 120, 196);
  const maxGridWidth = Math.max(MIN_GRID_SIZE, viewportWidth - horizontalPadding * 2);
  let availableGridHeight = viewportHeight - hudHeight - controlsHeight - verticalPadding * 4;

  if (availableGridHeight < MIN_GRID_SIZE) {
    const shortfall = MIN_GRID_SIZE - availableGridHeight;
    const maxControlReduction = Math.max(0, controlsHeight - 104);
    const controlReduction = Math.min(shortfall * 0.65, maxControlReduction);
    controlsHeight -= controlReduction;

    const remainingShortfall = shortfall - controlReduction;
    if (remainingShortfall > 0) {
      const maxHudReduction = Math.max(0, hudHeight - 64);
      const hudReduction = Math.min(remainingShortfall, maxHudReduction);
      hudHeight -= hudReduction;
    }

    availableGridHeight = viewportHeight - hudHeight - controlsHeight - verticalPadding * 4;
  }

  const gridSize = Math.max(MIN_GRID_SIZE, Math.min(maxGridWidth, availableGridHeight));
  const gridX = (viewportWidth - gridSize) / 2;
  const hudY = verticalPadding;
  const gridY = hudY + hudHeight + verticalPadding;
  const controlsY = gridY + gridSize + verticalPadding;
  const controlsWidth = viewportWidth - horizontalPadding * 2;
  const buttonGap = clamp(controlsWidth * 0.025, 8, 14);
  const topRowHeight = Math.max(42, (controlsHeight - buttonGap) / 2);
  const topRowButtonWidth = Math.max(56, (controlsWidth - buttonGap) / 2);

  const hintButton: LayoutRect = {
    x: horizontalPadding,
    y: controlsY,
    width: topRowButtonWidth,
    height: topRowHeight,
  };
  const reshuffleButton: LayoutRect = {
    x: horizontalPadding + topRowButtonWidth + buttonGap,
    y: controlsY,
    width: topRowButtonWidth,
    height: topRowHeight,
  };
  const leaderboardButton: LayoutRect = {
    x: horizontalPadding,
    y: controlsY + topRowHeight + buttonGap,
    width: controlsWidth,
    height: topRowHeight,
  };

  return {
    viewport: {
      width: viewportWidth,
      height: viewportHeight,
    },
    hud: {
      x: horizontalPadding,
      y: hudY,
      width: viewportWidth - horizontalPadding * 2,
      height: hudHeight,
    },
    grid: {
      x: gridX,
      y: gridY,
      width: gridSize,
      height: gridSize,
    },
    controls: {
      x: horizontalPadding,
      y: controlsY,
      width: controlsWidth,
      height: controlsHeight,
    },
    buttons: {
      hint: hintButton,
      reshuffle: reshuffleButton,
      leaderboard: leaderboardButton,
    },
    progressAnchor: {
      x: horizontalPadding + 8,
      y: hudY + hudHeight * 0.58,
    },
    scoreAnchor: {
      x: viewportWidth - horizontalPadding - 8,
      y: hudY + hudHeight * 0.58,
    },
  };
}
