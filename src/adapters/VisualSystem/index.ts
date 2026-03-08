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
  readonly metricsRow: LayoutRect;
  readonly progressCard: LayoutRect;
  readonly scoreCard: LayoutRect;
  readonly currentWord: LayoutRect;
  readonly grid: LayoutRect;
  readonly controls: LayoutRect;
  readonly buttons: {
    readonly hint: LayoutRect;
    readonly reshuffle: LayoutRect;
    readonly leaderboard: LayoutRect;
  };
  readonly progressBar: LayoutRect;
  readonly progressAnchor: LayoutPoint;
  readonly scoreAnchor: LayoutPoint;
}

export type VisualLayoutZoneId = 'topMetrics' | 'currentWord' | 'grid' | 'helpButtons';

export interface VisualLayoutZone {
  readonly id: VisualLayoutZoneId;
  readonly order: 1 | 2 | 3 | 4;
  readonly description: string;
}

export interface VisualPanelContract {
  readonly fillHex: HexColor;
  readonly fillAlpha: number;
  readonly strokeHex: HexColor;
  readonly strokeAlpha: number;
}

export type VisualButtonId = 'hint' | 'reshuffle' | 'leaderboard';
export type VisualButtonState = 'base' | 'hover' | 'focus' | 'pressed' | 'disabled';

export interface VisualButtonStateContract extends VisualPanelContract {
  readonly labelHex: HexColor;
  readonly labelAlpha: number;
  readonly offsetY: number;
  readonly glowAlpha: number;
}

export interface VisualShellTokens {
  readonly appBackgroundHex: HexColor;
  readonly appCloudCoolHex: HexColor;
  readonly appCloudMintHex: HexColor;
  readonly appCloudWarmHex: HexColor;
  readonly shellStrokeHex: HexColor;
  readonly shellFillCss: string;
  readonly shellShadowCss: string;
}

export interface VisualPanelTokens {
  readonly metric: VisualPanelContract;
  readonly currentWord: VisualPanelContract;
  readonly controls: VisualPanelContract;
}

export interface VisualTextTokens {
  readonly primaryHex: HexColor;
  readonly mutedHex: HexColor;
  readonly progressCounterHex: HexColor;
  readonly scoreLabelHex: HexColor;
  readonly scoreValueHex: HexColor;
  readonly currentWordHex: HexColor;
  readonly currentWordCompletedHex: HexColor;
  readonly currentWordPlaceholderHex: HexColor;
  readonly letterHex: HexColor;
  readonly activeLetterHex: HexColor;
  readonly toastHex: HexColor;
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

export interface VisualGridTokens {
  readonly panel: VisualPanelContract;
  readonly cellFillHex: HexColor;
  readonly cellFillAlpha: number;
  readonly cellStrokeHex: HexColor;
  readonly cellStrokeAlpha: number;
  readonly cellActiveFillHex: HexColor;
  readonly cellActiveFillAlpha: number;
  readonly cellActiveStrokeHex: HexColor;
  readonly cellActiveStrokeAlpha: number;
  readonly pathHex: HexColor;
  readonly hintFillHex: HexColor;
  readonly hintFillAlpha: number;
  readonly hintStrokeHex: HexColor;
  readonly hintStrokeAlpha: number;
  readonly undoStrokeHex: HexColor;
}

export interface VisualProgressBarTokens {
  readonly trackFillHex: HexColor;
  readonly trackFillAlpha: number;
  readonly trackStrokeHex: HexColor;
  readonly trackStrokeAlpha: number;
  readonly glowHex: HexColor;
  readonly glowMaxAlpha: number;
  readonly glowScaleBoost: number;
}

export interface VisualFeedbackTokens {
  readonly targetPathHex: HexColor;
  readonly bonusPathHex: HexColor;
  readonly targetParticleHex: HexColor;
  readonly bonusParticleHex: HexColor;
  readonly toastFillHex: HexColor;
  readonly toastFillAlpha: number;
  readonly toastStrokeHex: HexColor;
  readonly toastStrokeAlpha: number;
}

export interface VisualCurrentWordTokens {
  readonly blurStrength: number;
}

export interface VisualTypographyTokens {
  readonly fontFamily: string;
}

export interface VisualMotionWindow {
  readonly min: number;
  readonly max: number;
  readonly recommended: number;
}

export interface VisualMotionTokens {
  readonly buttonHoverDurationMs: number;
  readonly buttonPressDurationMs: number;
  readonly progressBarFillDurationMs: VisualMotionWindow;
  readonly progressBarPulseDurationMs: number;
  readonly targetWordTransitionDurationMs: VisualMotionWindow;
}

export interface VisualTokens {
  readonly shell: VisualShellTokens;
  readonly panels: VisualPanelTokens;
  readonly text: VisualTextTokens;
  readonly accents: VisualAccentTokens;
  readonly grid: VisualGridTokens;
  readonly progressBar: VisualProgressBarTokens;
  readonly feedback: VisualFeedbackTokens;
  readonly currentWord: VisualCurrentWordTokens;
  readonly typography: VisualTypographyTokens;
  readonly motion: VisualMotionTokens;
}

export interface CurrentWordTransitionFrame {
  readonly outgoingAlpha: number;
  readonly incomingAlpha: number;
  readonly outgoingBlurStrength: number;
  readonly incomingBlurStrength: number;
}

export interface ProgressBarPulseFrame {
  readonly glowAlpha: number;
  readonly glowScale: number;
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
  resolveCurrentWordTransition: (progress: number) => CurrentWordTransitionFrame;
  resolveProgressBarPulse: (progress: number) => ProgressBarPulseFrame;
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
  shell: {
    appBackgroundHex: '#F5FAFF',
    appCloudCoolHex: '#DDEFFC',
    appCloudMintHex: '#E7FBF2',
    appCloudWarmHex: '#FFE8D8',
    shellStrokeHex: '#D6E7F5',
    shellFillCss: 'rgb(255 255 255 / 72%)',
    shellShadowCss: 'rgb(110 144 172 / 18%)',
  },
  panels: {
    metric: {
      fillHex: '#FFFFFF',
      fillAlpha: 0.8,
      strokeHex: '#D6E7F5',
      strokeAlpha: 0.68,
    },
    currentWord: {
      fillHex: '#FFFFFF',
      fillAlpha: 0.84,
      strokeHex: '#D6E7F5',
      strokeAlpha: 0.72,
    },
    controls: {
      fillHex: '#FFFFFF',
      fillAlpha: 0.76,
      strokeHex: '#D6E7F5',
      strokeAlpha: 0.62,
    },
  },
  text: {
    primaryHex: '#4A5F73',
    mutedHex: '#8AA0B5',
    progressCounterHex: '#5C7892',
    scoreLabelHex: '#8AA0B5',
    scoreValueHex: '#4A5F73',
    currentWordHex: '#4AA7D8',
    currentWordCompletedHex: '#77E39D',
    currentWordPlaceholderHex: '#A3B6C8',
    letterHex: '#4A5F73',
    activeLetterHex: '#2D6E72',
    toastHex: '#6E4E45',
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
  grid: {
    panel: {
      fillHex: '#FFFFFF',
      fillAlpha: 0.92,
      strokeHex: '#D6E7F5',
      strokeAlpha: 0.82,
    },
    cellFillHex: '#FFFFFF',
    cellFillAlpha: 0.94,
    cellStrokeHex: '#D7E6F4',
    cellStrokeAlpha: 0.72,
    cellActiveFillHex: '#E8FBF3',
    cellActiveFillAlpha: 0.98,
    cellActiveStrokeHex: '#7ED8FF',
    cellActiveStrokeAlpha: 0.94,
    pathHex: '#7FF0D1',
    hintFillHex: '#4FD0C8',
    hintFillAlpha: 0.18,
    hintStrokeHex: '#4AA7D8',
    hintStrokeAlpha: 0.34,
    undoStrokeHex: '#4AA7D8',
  },
  progressBar: {
    trackFillHex: '#EDF7FD',
    trackFillAlpha: 0.92,
    trackStrokeHex: '#D0E5F3',
    trackStrokeAlpha: 0.78,
    glowHex: '#7FF0D1',
    glowMaxAlpha: 0.32,
    glowScaleBoost: 0.16,
  },
  feedback: {
    targetPathHex: '#77E39D',
    bonusPathHex: '#FFBF76',
    targetParticleHex: '#77E39D',
    bonusParticleHex: '#FFBF76',
    toastFillHex: '#FFF3EC',
    toastFillAlpha: 0.96,
    toastStrokeHex: '#FFD1BF',
    toastStrokeAlpha: 0.82,
  },
  currentWord: {
    blurStrength: 6,
  },
  typography: {
    fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
  },
  motion: {
    buttonHoverDurationMs: 160,
    buttonPressDurationMs: 100,
    progressBarFillDurationMs: {
      min: 220,
      max: 320,
      recommended: 260,
    },
    progressBarPulseDurationMs: 240,
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
      fillHex: '#E8FAF5',
      fillAlpha: 0.9,
      strokeHex: '#4FD0C8',
      strokeAlpha: 0.44,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: 0,
      glowAlpha: 0,
    },
    hover: {
      fillHex: '#F1FDF9',
      fillAlpha: 0.94,
      strokeHex: '#4FD0C8',
      strokeAlpha: 0.56,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: -2,
      glowAlpha: 0.08,
    },
    focus: {
      fillHex: '#F1FDF9',
      fillAlpha: 0.96,
      strokeHex: '#4FD0C8',
      strokeAlpha: 0.74,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: -1,
      glowAlpha: 0.2,
    },
    pressed: {
      fillHex: '#DAF3EC',
      fillAlpha: 0.86,
      strokeHex: '#4FD0C8',
      strokeAlpha: 0.4,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: 1,
      glowAlpha: 0.04,
    },
    disabled: {
      fillHex: '#E6EEF5',
      fillAlpha: 0.56,
      strokeHex: '#B7C7D6',
      strokeAlpha: 0.32,
      labelHex: '#7A8E9F',
      labelAlpha: 0.78,
      offsetY: 0,
      glowAlpha: 0,
    },
  },
  reshuffle: {
    base: {
      fillHex: '#ECF3FF',
      fillAlpha: 0.9,
      strokeHex: '#6AA8FF',
      strokeAlpha: 0.44,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: 0,
      glowAlpha: 0,
    },
    hover: {
      fillHex: '#F3F7FF',
      fillAlpha: 0.94,
      strokeHex: '#6AA8FF',
      strokeAlpha: 0.56,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: -2,
      glowAlpha: 0.08,
    },
    focus: {
      fillHex: '#F3F7FF',
      fillAlpha: 0.96,
      strokeHex: '#6AA8FF',
      strokeAlpha: 0.74,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: -1,
      glowAlpha: 0.2,
    },
    pressed: {
      fillHex: '#DFEAFF',
      fillAlpha: 0.86,
      strokeHex: '#6AA8FF',
      strokeAlpha: 0.4,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: 1,
      glowAlpha: 0.04,
    },
    disabled: {
      fillHex: '#E6EEF5',
      fillAlpha: 0.56,
      strokeHex: '#B7C7D6',
      strokeAlpha: 0.32,
      labelHex: '#7A8E9F',
      labelAlpha: 0.78,
      offsetY: 0,
      glowAlpha: 0,
    },
  },
  leaderboard: {
    base: {
      fillHex: '#F0F5FA',
      fillAlpha: 0.9,
      strokeHex: '#7AA7D9',
      strokeAlpha: 0.42,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: 0,
      glowAlpha: 0,
    },
    hover: {
      fillHex: '#F6F9FC',
      fillAlpha: 0.94,
      strokeHex: '#7AA7D9',
      strokeAlpha: 0.54,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: -2,
      glowAlpha: 0.08,
    },
    focus: {
      fillHex: '#F6F9FC',
      fillAlpha: 0.96,
      strokeHex: '#7AA7D9',
      strokeAlpha: 0.72,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: -1,
      glowAlpha: 0.18,
    },
    pressed: {
      fillHex: '#E4EDF6',
      fillAlpha: 0.86,
      strokeHex: '#7AA7D9',
      strokeAlpha: 0.4,
      labelHex: '#355A67',
      labelAlpha: 1,
      offsetY: 1,
      glowAlpha: 0.04,
    },
    disabled: {
      fillHex: '#E6EEF5',
      fillAlpha: 0.56,
      strokeHex: '#B7C7D6',
      strokeAlpha: 0.32,
      labelHex: '#7A8E9F',
      labelAlpha: 0.78,
      offsetY: 0,
      glowAlpha: 0,
    },
  },
} as const satisfies ButtonContractMap;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(progress: number): number {
  const inverse = 1 - progress;
  return 1 - inverse * inverse * inverse;
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
  const metricsGap = clamp(viewportWidth * 0.025, 10, 16);
  const hudGap = clamp(viewportHeight * 0.012, 8, 14);

  let metricsHeight = clamp(viewportHeight * 0.1, 68, 94);
  let currentWordHeight = clamp(viewportHeight * 0.085, 56, 86);
  let controlsHeight = clamp(viewportHeight * 0.19, 120, 196);

  const maxGridWidth = Math.max(MIN_GRID_SIZE, viewportWidth - horizontalPadding * 2);
  let hudHeight = metricsHeight + currentWordHeight + hudGap;
  let availableGridHeight = viewportHeight - hudHeight - controlsHeight - verticalPadding * 4;

  if (availableGridHeight < MIN_GRID_SIZE) {
    const shortfall = MIN_GRID_SIZE - availableGridHeight;
    const maxControlReduction = Math.max(0, controlsHeight - 104);
    const controlReduction = Math.min(shortfall * 0.55, maxControlReduction);
    controlsHeight -= controlReduction;

    let remainingShortfall = shortfall - controlReduction;
    if (remainingShortfall > 0) {
      const maxCurrentWordReduction = Math.max(0, currentWordHeight - 50);
      const currentWordReduction = Math.min(remainingShortfall * 0.65, maxCurrentWordReduction);
      currentWordHeight -= currentWordReduction;
      remainingShortfall -= currentWordReduction;
    }

    if (remainingShortfall > 0) {
      const maxMetricsReduction = Math.max(0, metricsHeight - 62);
      const metricsReduction = Math.min(remainingShortfall, maxMetricsReduction);
      metricsHeight -= metricsReduction;
    }

    hudHeight = metricsHeight + currentWordHeight + hudGap;
    availableGridHeight = viewportHeight - hudHeight - controlsHeight - verticalPadding * 4;
  }

  const gridSize = Math.max(MIN_GRID_SIZE, Math.min(maxGridWidth, availableGridHeight));
  const gridX = (viewportWidth - gridSize) / 2;
  const hudY = verticalPadding;
  const metricsWidth = viewportWidth - horizontalPadding * 2;
  const cardWidth = (metricsWidth - metricsGap) / 2;
  const currentWordY = hudY + metricsHeight + hudGap;
  const gridY = currentWordY + currentWordHeight + verticalPadding;
  const controlsY = gridY + gridSize + verticalPadding;
  const controlsWidth = viewportWidth - horizontalPadding * 2;
  const buttonGap = clamp(controlsWidth * 0.025, 8, 14);
  const topRowHeight = Math.max(42, (controlsHeight - buttonGap) / 2);
  const topRowButtonWidth = Math.max(56, (controlsWidth - buttonGap) / 2);
  const progressBarPaddingX = clamp(cardWidth * 0.08, 14, 22);
  const progressBarHeight = clamp(metricsHeight * 0.2, 10, 16);

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
      width: metricsWidth,
      height: hudHeight,
    },
    metricsRow: {
      x: horizontalPadding,
      y: hudY,
      width: metricsWidth,
      height: metricsHeight,
    },
    progressCard: {
      x: horizontalPadding,
      y: hudY,
      width: cardWidth,
      height: metricsHeight,
    },
    scoreCard: {
      x: horizontalPadding + cardWidth + metricsGap,
      y: hudY,
      width: cardWidth,
      height: metricsHeight,
    },
    currentWord: {
      x: horizontalPadding,
      y: currentWordY,
      width: metricsWidth,
      height: currentWordHeight,
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
    progressBar: {
      x: horizontalPadding + progressBarPaddingX,
      y: hudY + metricsHeight * 0.24,
      width: cardWidth - progressBarPaddingX * 2,
      height: progressBarHeight,
    },
    progressAnchor: {
      x: horizontalPadding + progressBarPaddingX,
      y: hudY + metricsHeight * 0.72,
    },
    scoreAnchor: {
      x: horizontalPadding + cardWidth + metricsGap + cardWidth - progressBarPaddingX,
      y: hudY + metricsHeight * 0.68,
    },
  };
}

export function resolveButtonState(
  buttonId: VisualButtonId,
  state: VisualButtonState,
): VisualButtonStateContract {
  return visualButtonStateContracts[buttonId][state];
}

export function resolveCurrentWordTransition(progress: number): CurrentWordTransitionFrame {
  const normalizedProgress = clamp(progress, 0, 1);
  const easedProgress = easeOutCubic(normalizedProgress);
  const blurStrength = visualTokens.currentWord.blurStrength;

  return {
    outgoingAlpha: 1 - normalizedProgress,
    incomingAlpha: easedProgress,
    outgoingBlurStrength: blurStrength * normalizedProgress,
    incomingBlurStrength: blurStrength * (1 - easedProgress),
  };
}

export function resolveProgressBarPulse(progress: number): ProgressBarPulseFrame {
  const normalizedProgress = clamp(progress, 0, 1);
  if (normalizedProgress === 0 || normalizedProgress === 1) {
    return {
      glowAlpha: 0,
      glowScale: 1,
    };
  }

  const pulse = Math.sin(normalizedProgress * Math.PI);

  return {
    glowAlpha: visualTokens.progressBar.glowMaxAlpha * pulse,
    glowScale: 1 + visualTokens.progressBar.glowScaleBoost * pulse,
  };
}

export function createVisualSystemModule(): VisualSystemModule {
  return {
    moduleName: MODULE_IDS.visualSystem,
    layoutHierarchy: VISUAL_LAYOUT_HIERARCHY,
    tokens: visualTokens,
    computeLayout: computeGameLayout,
    resolveButtonState,
    resolveCurrentWordTransition,
    resolveProgressBarPulse,
  };
}
