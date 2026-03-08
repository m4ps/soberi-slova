import { MODULE_IDS } from '../../shared/module-ids';

export type HexColor = `#${string}`;

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

export type VisualLayoutZoneId = 'topMetrics' | 'currentWord' | 'grid' | 'helpButtons';

export interface VisualLayoutZone {
  readonly id: VisualLayoutZoneId;
  readonly order: 1 | 2 | 3 | 4;
  readonly description: string;
}

export type VisualButtonId = 'hint' | 'reshuffle' | 'leaderboard';
export type VisualButtonState = 'base' | 'hover' | 'focus' | 'pressed' | 'disabled';

export interface VisualButtonStateContract {
  readonly fillHex: HexColor;
  readonly fillAlpha: number;
  readonly strokeHex: HexColor;
  readonly strokeAlpha: number;
  readonly labelHex: HexColor;
  readonly labelAlpha: number;
  readonly offsetY: number;
}

export interface VisualSurfaceTokens {
  readonly appBackgroundHex: HexColor;
  readonly appCloudHex: HexColor;
  readonly panelFillHex: HexColor;
  readonly panelStrokeHex: HexColor;
  readonly textPrimaryHex: HexColor;
  readonly textMutedHex: HexColor;
}

export interface VisualAccentTokens {
  readonly progressStartHex: HexColor;
  readonly progressEndHex: HexColor;
  readonly focusWordHex: HexColor;
  readonly targetSuccessHex: HexColor;
  readonly bonusSuccessHex: HexColor;
  readonly hintHex: HexColor;
  readonly reshuffleHex: HexColor;
  readonly leaderboardHex: HexColor;
  readonly toastFailHex: HexColor;
}

export interface VisualMotionTokens {
  readonly buttonHoverDurationMs: number;
  readonly buttonPressDurationMs: number;
  readonly targetWordTransitionDurationMs: {
    readonly min: number;
    readonly max: number;
    readonly recommended: number;
  };
}

export interface VisualTokens {
  readonly surfaces: VisualSurfaceTokens;
  readonly accents: VisualAccentTokens;
  readonly motion: VisualMotionTokens;
}

export interface VisualSystemModule {
  readonly moduleName: typeof MODULE_IDS.visualSystem;
  readonly layoutHierarchy: readonly VisualLayoutZone[];
  readonly tokens: VisualTokens;
  computeLayout: (viewportWidth: number, viewportHeight: number) => GameLayout;
  resolveButtonState: (
    buttonId: VisualButtonId,
    state: VisualButtonState,
  ) => VisualButtonStateContract;
}

const MIN_DIMENSION = 1;
const MIN_GRID_SIZE = 180;

type ButtonStateMap = Readonly<Record<VisualButtonState, VisualButtonStateContract>>;
type ButtonContractMap = Readonly<Record<VisualButtonId, ButtonStateMap>>;

export const VISUAL_LAYOUT_HIERARCHY = [
  {
    id: 'topMetrics',
    order: 1,
    description: 'Равновесная верхняя строка прогресса и общего счёта.',
  },
  {
    id: 'currentWord',
    order: 2,
    description: 'Компактный блок текущего слова между метриками и сеткой.',
  },
  {
    id: 'grid',
    order: 3,
    description: 'Доминирующее игровое поле, сохраняющее визуальный приоритет.',
  },
  {
    id: 'helpButtons',
    order: 4,
    description: 'Вторичный блок кнопок помощи под сеткой.',
  },
] as const satisfies readonly VisualLayoutZone[];

export const visualTokens = {
  surfaces: {
    appBackgroundHex: '#F5FAFF',
    appCloudHex: '#DDEFFC',
    panelFillHex: '#FFFFFF',
    panelStrokeHex: '#D6E7F5',
    textPrimaryHex: '#4A5F73',
    textMutedHex: '#8AA0B5',
  },
  accents: {
    progressStartHex: '#7ED8FF',
    progressEndHex: '#7FF0D1',
    focusWordHex: '#4AA7D8',
    targetSuccessHex: '#77E39D',
    bonusSuccessHex: '#FFBF76',
    hintHex: '#4FD0C8',
    reshuffleHex: '#6AA8FF',
    leaderboardHex: '#7AA7D9',
    toastFailHex: '#FF9B7B',
  },
  motion: {
    buttonHoverDurationMs: 160,
    buttonPressDurationMs: 100,
    targetWordTransitionDurationMs: {
      min: 180,
      max: 240,
      recommended: 220,
    },
  },
} as const satisfies VisualTokens;

export const visualButtonStateContracts = {
  hint: {
    base: {
      fillHex: '#E5F8F4',
      fillAlpha: 0.86,
      strokeHex: '#4FD0C8',
      strokeAlpha: 0.42,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: 0,
    },
    hover: {
      fillHex: '#EEFDF9',
      fillAlpha: 0.92,
      strokeHex: '#4FD0C8',
      strokeAlpha: 0.52,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: -2,
    },
    focus: {
      fillHex: '#EEFDF9',
      fillAlpha: 0.94,
      strokeHex: '#4FD0C8',
      strokeAlpha: 0.72,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: -1,
    },
    pressed: {
      fillHex: '#D6F2EC',
      fillAlpha: 0.82,
      strokeHex: '#4FD0C8',
      strokeAlpha: 0.38,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: 1,
    },
    disabled: {
      fillHex: '#E6EEF5',
      fillAlpha: 0.54,
      strokeHex: '#B7C7D6',
      strokeAlpha: 0.3,
      labelHex: '#7A8E9F',
      labelAlpha: 0.78,
      offsetY: 0,
    },
  },
  reshuffle: {
    base: {
      fillHex: '#EAF2FF',
      fillAlpha: 0.86,
      strokeHex: '#6AA8FF',
      strokeAlpha: 0.42,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: 0,
    },
    hover: {
      fillHex: '#F1F6FF',
      fillAlpha: 0.92,
      strokeHex: '#6AA8FF',
      strokeAlpha: 0.52,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: -2,
    },
    focus: {
      fillHex: '#F1F6FF',
      fillAlpha: 0.94,
      strokeHex: '#6AA8FF',
      strokeAlpha: 0.72,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: -1,
    },
    pressed: {
      fillHex: '#DCEAFF',
      fillAlpha: 0.82,
      strokeHex: '#6AA8FF',
      strokeAlpha: 0.38,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: 1,
    },
    disabled: {
      fillHex: '#E6EEF5',
      fillAlpha: 0.54,
      strokeHex: '#B7C7D6',
      strokeAlpha: 0.3,
      labelHex: '#7A8E9F',
      labelAlpha: 0.78,
      offsetY: 0,
    },
  },
  leaderboard: {
    base: {
      fillHex: '#EDF2F8',
      fillAlpha: 0.88,
      strokeHex: '#7AA7D9',
      strokeAlpha: 0.38,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: 0,
    },
    hover: {
      fillHex: '#F4F8FC',
      fillAlpha: 0.92,
      strokeHex: '#7AA7D9',
      strokeAlpha: 0.5,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: -2,
    },
    focus: {
      fillHex: '#F4F8FC',
      fillAlpha: 0.94,
      strokeHex: '#7AA7D9',
      strokeAlpha: 0.7,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: -1,
    },
    pressed: {
      fillHex: '#E0EAF4',
      fillAlpha: 0.82,
      strokeHex: '#7AA7D9',
      strokeAlpha: 0.36,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: 1,
    },
    disabled: {
      fillHex: '#E6EEF5',
      fillAlpha: 0.54,
      strokeHex: '#B7C7D6',
      strokeAlpha: 0.3,
      labelHex: '#7A8E9F',
      labelAlpha: 0.78,
      offsetY: 0,
    },
  },
} as const satisfies ButtonContractMap;

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

export function resolveButtonState(
  buttonId: VisualButtonId,
  state: VisualButtonState,
): VisualButtonStateContract {
  return visualButtonStateContracts[buttonId][state];
}

export function createVisualSystemModule(): VisualSystemModule {
  return {
    moduleName: MODULE_IDS.visualSystem,
    layoutHierarchy: VISUAL_LAYOUT_HIERARCHY,
    tokens: visualTokens,
    computeLayout: computeGameLayout,
    resolveButtonState,
  };
}
