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

export type VisualFontWeight = '600' | '700';

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
  readonly shadowAlpha: number;
  readonly shadowOffsetY: number;
  readonly bloomAlpha: number;
}

export interface VisualShellTokens {
  readonly appBackgroundHex: HexColor;
  readonly appBackgroundEndHex: HexColor;
  readonly appCloudCoolHex: HexColor;
  readonly appCloudCoolAlpha: number;
  readonly appCloudMintHex: HexColor;
  readonly appCloudMintAlpha: number;
  readonly appCloudWarmHex: HexColor;
  readonly appCloudWarmAlpha: number;
  readonly appAmbientBloomHex: HexColor;
  readonly appAmbientBloomAlpha: number;
  readonly shellStrokeHex: HexColor;
  readonly shellFillCss: string;
  readonly shellShadowCss: string;
  readonly shellElevatedShadowCss: string;
  readonly shellBackdropBlurPx: number;
  readonly shellBorderRadiusPx: number;
}

export interface VisualPanelTokens {
  readonly metricsRow: VisualPanelContract;
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
  readonly particleHex: HexColor;
  readonly particleAccentHex: HexColor;
  readonly particleMaxAlpha: number;
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
  readonly labelWeight: VisualFontWeight;
  readonly valueWeight: VisualFontWeight;
  readonly currentWordWeight: VisualFontWeight;
  readonly letterWeight: VisualFontWeight;
  readonly currentWordLetterSpacing: number;
  readonly letterSpacing: number;
}

export interface VisualStrokeTokens {
  readonly shellWidth: number;
  readonly panelWidth: number;
  readonly gridCellWidth: number;
  readonly focusWidth: number;
  readonly hintWidth: number;
  readonly toastWidth: number;
}

export interface VisualSurfaceTreatmentTokens {
  readonly shadowHex: HexColor;
  readonly shadowAlpha: number;
  readonly shadowOffsetY: number;
  readonly highlightHex: HexColor;
  readonly highlightAlpha: number;
  readonly bloomHex: HexColor;
  readonly bloomAlpha: number;
}

export interface VisualSurfaceTokens {
  readonly metricsRow: VisualSurfaceTreatmentTokens;
  readonly metric: VisualSurfaceTreatmentTokens;
  readonly currentWord: VisualSurfaceTreatmentTokens;
  readonly controls: VisualSurfaceTreatmentTokens;
  readonly gridPanel: VisualSurfaceTreatmentTokens;
  readonly gridCell: VisualSurfaceTreatmentTokens;
  readonly button: VisualSurfaceTreatmentTokens;
  readonly progressBar: VisualSurfaceTreatmentTokens;
  readonly toast: VisualSurfaceTreatmentTokens;
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
  readonly stroke: VisualStrokeTokens;
  readonly surfaces: VisualSurfaceTokens;
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
    appBackgroundEndHex: '#FCFEFF',
    appCloudCoolHex: '#DDEFFC',
    appCloudCoolAlpha: 0.46,
    appCloudMintHex: '#E7FBF2',
    appCloudMintAlpha: 0.36,
    appCloudWarmHex: '#FFE8D8',
    appCloudWarmAlpha: 0.28,
    appAmbientBloomHex: '#FFFFFF',
    appAmbientBloomAlpha: 0.42,
    shellStrokeHex: '#D6E7F5',
    shellFillCss: 'rgb(255 255 255 / 68%)',
    shellShadowCss: 'rgb(110 144 172 / 14%)',
    shellElevatedShadowCss: 'rgb(166 199 221 / 26%)',
    shellBackdropBlurPx: 18,
    shellBorderRadiusPx: 28,
  },
  panels: {
    metricsRow: {
      fillHex: '#FFFFFF',
      fillAlpha: 0.46,
      strokeHex: '#DCEAF5',
      strokeAlpha: 0.42,
    },
    metric: {
      fillHex: '#FFFFFF',
      fillAlpha: 0.76,
      strokeHex: '#D6E7F5',
      strokeAlpha: 0.62,
    },
    currentWord: {
      fillHex: '#FFFFFF',
      fillAlpha: 0.84,
      strokeHex: '#D6E7F5',
      strokeAlpha: 0.72,
    },
    controls: {
      fillHex: '#FFFFFF',
      fillAlpha: 0.64,
      strokeHex: '#D6E7F5',
      strokeAlpha: 0.52,
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
    particleHex: '#F7FFFC',
    particleAccentHex: '#7FF0D1',
    particleMaxAlpha: 0.34,
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
    fontFamily: '"Avenir Next", "Avenir", "Trebuchet MS", "Segoe UI", sans-serif',
    labelWeight: '600',
    valueWeight: '700',
    currentWordWeight: '700',
    letterWeight: '700',
    currentWordLetterSpacing: -0.6,
    letterSpacing: 0.45,
  },
  stroke: {
    shellWidth: 1,
    panelWidth: 2,
    gridCellWidth: 1.75,
    focusWidth: 2.5,
    hintWidth: 2,
    toastWidth: 2,
  },
  surfaces: {
    metricsRow: {
      shadowHex: '#D4E4EF',
      shadowAlpha: 0.11,
      shadowOffsetY: 6,
      highlightHex: '#FFFFFF',
      highlightAlpha: 0.58,
      bloomHex: '#F8FCFF',
      bloomAlpha: 0.44,
    },
    metric: {
      shadowHex: '#C4D9EA',
      shadowAlpha: 0.18,
      shadowOffsetY: 8,
      highlightHex: '#FFFFFF',
      highlightAlpha: 0.76,
      bloomHex: '#F8FDFF',
      bloomAlpha: 0.62,
    },
    currentWord: {
      shadowHex: '#BDD7E8',
      shadowAlpha: 0.22,
      shadowOffsetY: 12,
      highlightHex: '#FFFFFF',
      highlightAlpha: 0.88,
      bloomHex: '#F6FBFF',
      bloomAlpha: 0.74,
    },
    controls: {
      shadowHex: '#C8DCEB',
      shadowAlpha: 0.1,
      shadowOffsetY: 6,
      highlightHex: '#FFFFFF',
      highlightAlpha: 0.62,
      bloomHex: '#F9FDFF',
      bloomAlpha: 0.42,
    },
    gridPanel: {
      shadowHex: '#BCD4E6',
      shadowAlpha: 0.22,
      shadowOffsetY: 14,
      highlightHex: '#FFFFFF',
      highlightAlpha: 0.9,
      bloomHex: '#F8FCFF',
      bloomAlpha: 0.72,
    },
    gridCell: {
      shadowHex: '#C8DCEB',
      shadowAlpha: 0.14,
      shadowOffsetY: 4,
      highlightHex: '#FFFFFF',
      highlightAlpha: 0.78,
      bloomHex: '#FDFEFF',
      bloomAlpha: 0.64,
    },
    button: {
      shadowHex: '#C4D9EA',
      shadowAlpha: 0.16,
      shadowOffsetY: 7,
      highlightHex: '#FFFFFF',
      highlightAlpha: 0.76,
      bloomHex: '#F9FDFF',
      bloomAlpha: 0.6,
    },
    progressBar: {
      shadowHex: '#C7DCEC',
      shadowAlpha: 0.16,
      shadowOffsetY: 4,
      highlightHex: '#FFFFFF',
      highlightAlpha: 0.68,
      bloomHex: '#F5FEFB',
      bloomAlpha: 0.54,
    },
    toast: {
      shadowHex: '#F2C7B7',
      shadowAlpha: 0.18,
      shadowOffsetY: 8,
      highlightHex: '#FFFDF9',
      highlightAlpha: 0.72,
      bloomHex: '#FFF7F2',
      bloomAlpha: 0.6,
    },
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
      fillHex: '#F3FCF8',
      fillAlpha: 0.82,
      strokeHex: '#4FD0C8',
      strokeAlpha: 0.28,
      labelHex: '#486372',
      labelAlpha: 0.94,
      offsetY: 0,
      glowAlpha: 0,
      shadowAlpha: 0.16,
      shadowOffsetY: 7,
      bloomAlpha: 0.6,
    },
    hover: {
      fillHex: '#F8FEFB',
      fillAlpha: 0.88,
      strokeHex: '#4FD0C8',
      strokeAlpha: 0.36,
      labelHex: '#486372',
      labelAlpha: 0.96,
      offsetY: -2,
      glowAlpha: 0.08,
      shadowAlpha: 0.22,
      shadowOffsetY: 9,
      bloomAlpha: 0.7,
    },
    focus: {
      fillHex: '#F1FDF9',
      fillAlpha: 0.96,
      strokeHex: '#4FD0C8',
      strokeAlpha: 0.74,
      labelHex: '#486372',
      labelAlpha: 1,
      offsetY: -1,
      glowAlpha: 0.2,
      shadowAlpha: 0.24,
      shadowOffsetY: 8,
      bloomAlpha: 0.74,
    },
    pressed: {
      fillHex: '#E8F6F0',
      fillAlpha: 0.8,
      strokeHex: '#4FD0C8',
      strokeAlpha: 0.26,
      labelHex: '#486372',
      labelAlpha: 0.94,
      offsetY: 1,
      glowAlpha: 0.04,
      shadowAlpha: 0.1,
      shadowOffsetY: 4,
      bloomAlpha: 0.42,
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
      shadowAlpha: 0.08,
      shadowOffsetY: 4,
      bloomAlpha: 0.24,
    },
  },
  reshuffle: {
    base: {
      fillHex: '#F3F7FF',
      fillAlpha: 0.82,
      strokeHex: '#6AA8FF',
      strokeAlpha: 0.28,
      labelHex: '#486372',
      labelAlpha: 0.94,
      offsetY: 0,
      glowAlpha: 0,
      shadowAlpha: 0.16,
      shadowOffsetY: 7,
      bloomAlpha: 0.6,
    },
    hover: {
      fillHex: '#F8FAFF',
      fillAlpha: 0.88,
      strokeHex: '#6AA8FF',
      strokeAlpha: 0.36,
      labelHex: '#486372',
      labelAlpha: 0.96,
      offsetY: -2,
      glowAlpha: 0.08,
      shadowAlpha: 0.22,
      shadowOffsetY: 9,
      bloomAlpha: 0.7,
    },
    focus: {
      fillHex: '#F3F7FF',
      fillAlpha: 0.96,
      strokeHex: '#6AA8FF',
      strokeAlpha: 0.74,
      labelHex: '#486372',
      labelAlpha: 1,
      offsetY: -1,
      glowAlpha: 0.2,
      shadowAlpha: 0.24,
      shadowOffsetY: 8,
      bloomAlpha: 0.74,
    },
    pressed: {
      fillHex: '#EAF1FE',
      fillAlpha: 0.8,
      strokeHex: '#6AA8FF',
      strokeAlpha: 0.26,
      labelHex: '#486372',
      labelAlpha: 0.94,
      offsetY: 1,
      glowAlpha: 0.04,
      shadowAlpha: 0.1,
      shadowOffsetY: 4,
      bloomAlpha: 0.42,
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
      shadowAlpha: 0.08,
      shadowOffsetY: 4,
      bloomAlpha: 0.24,
    },
  },
  leaderboard: {
    base: {
      fillHex: '#F4F8FB',
      fillAlpha: 0.8,
      strokeHex: '#7AA7D9',
      strokeAlpha: 0.26,
      labelHex: '#526C7F',
      labelAlpha: 0.92,
      offsetY: 0,
      glowAlpha: 0,
      shadowAlpha: 0.16,
      shadowOffsetY: 7,
      bloomAlpha: 0.58,
    },
    hover: {
      fillHex: '#F9FBFD',
      fillAlpha: 0.88,
      strokeHex: '#7AA7D9',
      strokeAlpha: 0.34,
      labelHex: '#526C7F',
      labelAlpha: 0.94,
      offsetY: -2,
      glowAlpha: 0.08,
      shadowAlpha: 0.22,
      shadowOffsetY: 9,
      bloomAlpha: 0.68,
    },
    focus: {
      fillHex: '#F6F9FC',
      fillAlpha: 0.96,
      strokeHex: '#7AA7D9',
      strokeAlpha: 0.72,
      labelHex: '#526C7F',
      labelAlpha: 1,
      offsetY: -1,
      glowAlpha: 0.18,
      shadowAlpha: 0.24,
      shadowOffsetY: 8,
      bloomAlpha: 0.72,
    },
    pressed: {
      fillHex: '#E4EDF6',
      fillAlpha: 0.78,
      strokeHex: '#7AA7D9',
      strokeAlpha: 0.32,
      labelHex: '#526C7F',
      labelAlpha: 0.92,
      offsetY: 1,
      glowAlpha: 0.04,
      shadowAlpha: 0.1,
      shadowOffsetY: 4,
      bloomAlpha: 0.4,
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
      shadowAlpha: 0.08,
      shadowOffsetY: 4,
      bloomAlpha: 0.22,
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

  const horizontalPadding = clamp(viewportWidth * 0.055, 14, 26);
  const verticalPadding = clamp(viewportHeight * 0.018, 10, 22);
  const metricsGap = clamp(viewportWidth * 0.02, 8, 14);
  const metricsInsetX = clamp(viewportWidth * 0.018, 6, 10);
  const metricsToWordGap = clamp(viewportHeight * 0.011, 8, 12);
  const wordToGridBaseGap = clamp(viewportHeight * 0.02, 11, 22);
  const gridToControlsBaseGap = clamp(viewportHeight * 0.014, 8, 16);

  let metricsHeight = clamp(Math.min(viewportHeight * 0.082, viewportWidth * 0.2), 62, 78);
  let currentWordHeight = clamp(Math.min(viewportHeight * 0.06, viewportWidth * 0.145), 42, 60);
  let controlsHeight = clamp(Math.min(viewportHeight * 0.125, viewportWidth * 0.26), 88, 122);

  const maxGridWidth = Math.max(MIN_GRID_SIZE, viewportWidth - horizontalPadding * 2);
  let hudHeight = metricsHeight + currentWordHeight + metricsToWordGap;
  let availableGridHeight =
    viewportHeight -
    hudHeight -
    controlsHeight -
    wordToGridBaseGap -
    gridToControlsBaseGap -
    verticalPadding * 2;

  if (availableGridHeight < MIN_GRID_SIZE) {
    const shortfall = MIN_GRID_SIZE - availableGridHeight;
    const maxControlReduction = Math.max(0, controlsHeight - 78);
    const controlReduction = Math.min(shortfall * 0.55, maxControlReduction);
    controlsHeight -= controlReduction;

    let remainingShortfall = shortfall - controlReduction;
    if (remainingShortfall > 0) {
      const maxCurrentWordReduction = Math.max(0, currentWordHeight - 40);
      const currentWordReduction = Math.min(remainingShortfall * 0.65, maxCurrentWordReduction);
      currentWordHeight -= currentWordReduction;
      remainingShortfall -= currentWordReduction;
    }

    if (remainingShortfall > 0) {
      const maxMetricsReduction = Math.max(0, metricsHeight - 56);
      const metricsReduction = Math.min(remainingShortfall, maxMetricsReduction);
      metricsHeight -= metricsReduction;
    }

    hudHeight = metricsHeight + currentWordHeight + metricsToWordGap;
    availableGridHeight =
      viewportHeight -
      hudHeight -
      controlsHeight -
      wordToGridBaseGap -
      gridToControlsBaseGap -
      verticalPadding * 2;
  }

  const gridSize = Math.max(MIN_GRID_SIZE, Math.min(maxGridWidth, availableGridHeight));
  const compositionHeight =
    hudHeight + gridSize + controlsHeight + wordToGridBaseGap + gridToControlsBaseGap;
  const extraVerticalSpace = Math.max(0, viewportHeight - compositionHeight - verticalPadding * 2);
  const hudY = verticalPadding + extraVerticalSpace * 0.1;
  const wordToGridGap = wordToGridBaseGap + extraVerticalSpace * 0.24;
  const gridToControlsGap = gridToControlsBaseGap + extraVerticalSpace * 0.18;
  const gridX = (viewportWidth - gridSize) / 2;
  const metricsWidth = viewportWidth - horizontalPadding * 2;
  const metricsInsetY = clamp(metricsHeight * 0.16, 5, 9);
  const cardWidth = (metricsWidth - metricsInsetX * 2 - metricsGap) / 2;
  const cardHeight = Math.max(36, metricsHeight - metricsInsetY * 2);
  const currentWordY = hudY + metricsHeight + metricsToWordGap;
  const gridY = currentWordY + currentWordHeight + wordToGridGap;
  const controlsY = gridY + gridSize + gridToControlsGap;
  const controlsWidth = viewportWidth - horizontalPadding * 2;
  const buttonGap = clamp(controlsWidth * 0.02, 8, 12);
  const topRowHeight = Math.max(36, (controlsHeight - buttonGap) / 2);
  const topRowButtonWidth = Math.max(56, (controlsWidth - buttonGap) / 2);
  const progressBarPaddingX = clamp(cardWidth * 0.08, 12, 18);
  const progressBarHeight = clamp(cardHeight * 0.18, 9, 14);

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
      x: horizontalPadding + metricsInsetX,
      y: hudY + metricsInsetY,
      width: cardWidth,
      height: cardHeight,
    },
    scoreCard: {
      x: horizontalPadding + metricsInsetX + cardWidth + metricsGap,
      y: hudY + metricsInsetY,
      width: cardWidth,
      height: cardHeight,
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
      x: horizontalPadding + metricsInsetX + progressBarPaddingX,
      y: hudY + metricsInsetY + cardHeight * 0.22,
      width: cardWidth - progressBarPaddingX * 2,
      height: progressBarHeight,
    },
    progressAnchor: {
      x: horizontalPadding + metricsInsetX + progressBarPaddingX,
      y: hudY + metricsInsetY + cardHeight * 0.78,
    },
    scoreAnchor: {
      x:
        horizontalPadding +
        metricsInsetX +
        cardWidth +
        metricsGap +
        cardWidth -
        progressBarPaddingX,
      y: hudY + metricsInsetY + cardHeight * 0.72,
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
  const outgoingFadeProgress = clamp(normalizedProgress / 0.86, 0, 1);
  const incomingFadeProgress = clamp((normalizedProgress - 0.08) / 0.92, 0, 1);
  const easedOutgoingProgress = easeOutCubic(outgoingFadeProgress);
  const easedIncomingProgress = easeOutCubic(incomingFadeProgress);
  const blurStrength = visualTokens.currentWord.blurStrength;

  return {
    outgoingAlpha: 1 - easedOutgoingProgress,
    incomingAlpha: easedIncomingProgress,
    outgoingBlurStrength: blurStrength * easedOutgoingProgress,
    incomingBlurStrength: blurStrength * (1 - easedIncomingProgress),
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
