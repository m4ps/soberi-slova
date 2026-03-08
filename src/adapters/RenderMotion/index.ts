import { Application, BlurFilter, Color, Container, FillGradient, Graphics, Text } from 'pixi.js';

import type {
  ApplicationCommandBus,
  ApplicationEvent,
  ApplicationEventBus,
  ApplicationReadModel,
  GridCellRef,
} from '../../application';
import { GAME_VIEWPORT } from '../../config/viewport';
import { MODULE_IDS } from '../../shared/module-ids';
import {
  WORD_GRID_CELL_COUNT,
  WORD_GRID_SIDE,
  findWordPathInGrid,
  sortWordsByDifficulty,
} from '../../shared/word-grid';
import {
  createVisualSystemModule,
  type CurrentWordTransitionFrame,
  type GameLayout,
  type LayoutRect,
  type ProgressBarPulseFrame,
  type VisualButtonId,
  type VisualButtonState,
  type VisualButtonStateContract,
  type VisualPanelContract,
  type VisualSystemModule,
} from '../VisualSystem';

const GRID_SIZE = WORD_GRID_SIDE;
const GRID_CELL_COUNT = WORD_GRID_CELL_COUNT;
const FRAME_DURATION_MS = 1000 / 60;
const WORD_SUCCESS_ACK_DELAY_MS = 360;
const LEVEL_TRANSITION_ACK_DELAY_MS = 900;
const TOAST_DURATION_MS = 2_200;
const MAX_ACK_TRACKING = 128;
const DEV_TARGET_WORDS_CONSOLE_LOG_ENABLED = import.meta.env.DEV;
const DEV_TARGET_WORDS_CONSOLE_PREFIX = '[dev][target-words]';

type SuccessKind = 'target' | 'bonus';

interface RenderButton {
  readonly id: VisualButtonId;
  readonly container: Container;
  readonly glow: Graphics;
  readonly background: Graphics;
  readonly label: Text;
  isEnabled: boolean;
  isHovered: boolean;
  isPressed: boolean;
  renderState: ButtonRenderState;
  targetState: VisualButtonState;
  animation: ButtonAnimationState | null;
}

interface ButtonRenderState {
  readonly fillColor: number;
  readonly fillAlpha: number;
  readonly strokeColor: number;
  readonly strokeAlpha: number;
  readonly labelColor: number;
  readonly labelAlpha: number;
  readonly offsetY: number;
  readonly glowAlpha: number;
}

interface ButtonAnimationState {
  readonly from: ButtonRenderState;
  readonly to: ButtonRenderState;
  readonly durationMs: number;
  elapsedMs: number;
}

interface PathGlowAnimation {
  readonly kind: SuccessKind;
  readonly pathCells: readonly GridCellRef[];
  readonly color: number;
  elapsedMs: number;
  readonly durationMs: number;
}

interface FlyingLetterAnimation {
  readonly sprite: Text;
  readonly from: { x: number; y: number };
  readonly to: { x: number; y: number };
  readonly delayMs: number;
  readonly durationMs: number;
  elapsedMs: number;
}

interface PendingAcknowledgeJob {
  readonly operationId: string;
  readonly delayMs: number;
  readonly wordId: string;
  elapsedMs: number;
}

interface UndoPulse {
  readonly cell: GridCellRef;
  readonly durationMs: number;
  elapsedMs: number;
}

interface ProgressBarAnimation {
  readonly fromRatio: number;
  readonly toRatio: number;
  readonly durationMs: number;
  elapsedMs: number;
}

interface ProgressBarPulseAnimation {
  readonly ratio: number;
  readonly durationMs: number;
  elapsedMs: number;
}

interface CurrentWordVisual {
  readonly text: string;
  readonly color: number;
}

interface CurrentWordTransition {
  readonly from: CurrentWordVisual;
  readonly to: CurrentWordVisual;
  readonly durationMs: number;
  elapsedMs: number;
}

export interface RenderMotionSnapshot {
  readonly runtimeMode: string;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
    readonly isPortrait: boolean;
  };
  readonly layout: GameLayout;
  readonly stageChildren: number;
  readonly gameplay: {
    readonly levelId: string;
    readonly levelStatus: 'active' | 'completed' | 'reshuffling';
    readonly grid: {
      readonly side: number;
      readonly letters: readonly string[];
    };
    readonly allTimeScore: number;
    readonly displayedTargetWord: string | null;
    readonly currentHintPathProgress: number;
    readonly progress: {
      readonly foundTargets: number;
      readonly totalTargets: number;
    };
    readonly isInputLocked: boolean;
    readonly showEphemeralCongrats: boolean;
  };
  readonly help: {
    readonly isLocked: boolean;
    readonly lockedUntil: number | null;
    readonly lockReason: string | null;
    readonly cooldownMsRemaining: number;
    readonly cooldownReason: string | null;
  };
  readonly ui: {
    readonly activePathLength: number;
    readonly activeGlowAnimations: number;
    readonly activeFlyingLetters: number;
    readonly toastMessage: string | null;
    readonly progressFillRatio: number;
    readonly progressFillAnimating: boolean;
    readonly currentWordTransitionActive: boolean;
    readonly focusedButtonId: VisualButtonId | null;
    readonly hintEnabled: boolean;
    readonly reshuffleEnabled: boolean;
    readonly leaderboardEnabled: boolean;
  };
}

export interface RenderMotionRuntime {
  readonly moduleName: typeof MODULE_IDS.renderMotion;
  readonly canvas: HTMLCanvasElement;
  stepFrame: () => void;
  setInputPath: (path: readonly GridCellRef[]) => void;
  toTextSnapshot: () => RenderMotionSnapshot;
  dispose: () => Promise<void>;
}

export interface RenderMotionModule {
  readonly moduleName: typeof MODULE_IDS.renderMotion;
  mount: (rootElement: HTMLDivElement) => Promise<RenderMotionRuntime>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function easeOutCubic(progress: number): number {
  const inverse = 1 - progress;
  return 1 - inverse * inverse * inverse;
}

function sameCell(left: GridCellRef, right: GridCellRef): boolean {
  return left.row === right.row && left.col === right.col;
}

function clonePath(path: readonly GridCellRef[]): readonly GridCellRef[] {
  return path.map((cell) => ({ ...cell }));
}

function toGridCellIndex(row: number, col: number): number {
  return row * GRID_SIZE + col;
}

function resolveCellCenter(layout: GameLayout, cell: GridCellRef): { x: number; y: number } {
  const cellSize = layout.grid.width / GRID_SIZE;

  return {
    x: layout.grid.x + cell.col * cellSize + cellSize / 2,
    y: layout.grid.y + cell.row * cellSize + cellSize / 2,
  };
}

function resolveCellBounds(layout: GameLayout, row: number, col: number): LayoutRect {
  const cellSize = layout.grid.width / GRID_SIZE;

  return {
    x: layout.grid.x + col * cellSize,
    y: layout.grid.y + row * cellSize,
    width: cellSize,
    height: cellSize,
  };
}

function drawPanel(
  graphics: Graphics,
  rect: LayoutRect,
  radius: number,
  fillColor: number,
  fillAlpha: number,
  strokeColor: number,
  strokeAlpha: number,
): void {
  graphics
    .roundRect(rect.x, rect.y, rect.width, rect.height, radius)
    .fill({ color: fillColor, alpha: fillAlpha })
    .stroke({ color: strokeColor, width: 2, alpha: strokeAlpha });
}

function drawPanelContract(
  graphics: Graphics,
  rect: LayoutRect,
  radius: number,
  contract: VisualPanelContract,
): void {
  drawPanel(
    graphics,
    rect,
    radius,
    hexToColorNumber(contract.fillHex),
    contract.fillAlpha,
    hexToColorNumber(contract.strokeHex),
    contract.strokeAlpha,
  );
}

function hexToColorNumber(hexColor: string): number {
  return Number.parseInt(hexColor.replace('#', ''), 16);
}

function lerpColorNumber(start: number, end: number, progress: number): number {
  const startRed = (start >> 16) & 0xff;
  const startGreen = (start >> 8) & 0xff;
  const startBlue = start & 0xff;
  const endRed = (end >> 16) & 0xff;
  const endGreen = (end >> 8) & 0xff;
  const endBlue = end & 0xff;

  return (
    (Math.round(lerp(startRed, endRed, progress)) << 16) |
    (Math.round(lerp(startGreen, endGreen, progress)) << 8) |
    Math.round(lerp(startBlue, endBlue, progress))
  );
}

function buttonContractToRenderState(contract: VisualButtonStateContract): ButtonRenderState {
  return {
    fillColor: hexToColorNumber(contract.fillHex),
    fillAlpha: contract.fillAlpha,
    strokeColor: hexToColorNumber(contract.strokeHex),
    strokeAlpha: contract.strokeAlpha,
    labelColor: hexToColorNumber(contract.labelHex),
    labelAlpha: contract.labelAlpha,
    offsetY: contract.offsetY,
    glowAlpha: contract.glowAlpha,
  };
}

function interpolateButtonRenderState(
  from: ButtonRenderState,
  to: ButtonRenderState,
  progress: number,
): ButtonRenderState {
  return {
    fillColor: lerpColorNumber(from.fillColor, to.fillColor, progress),
    fillAlpha: lerp(from.fillAlpha, to.fillAlpha, progress),
    strokeColor: lerpColorNumber(from.strokeColor, to.strokeColor, progress),
    strokeAlpha: lerp(from.strokeAlpha, to.strokeAlpha, progress),
    labelColor: lerpColorNumber(from.labelColor, to.labelColor, progress),
    labelAlpha: lerp(from.labelAlpha, to.labelAlpha, progress),
    offsetY: lerp(from.offsetY, to.offsetY, progress),
    glowAlpha: lerp(from.glowAlpha, to.glowAlpha, progress),
  };
}

function resolveCurrentWordVisual(
  targetWord: string | null,
  showEphemeralCongrats: boolean,
  visualSystem: VisualSystemModule,
): CurrentWordVisual {
  if (targetWord) {
    return {
      text: targetWord,
      color: hexToColorNumber(visualSystem.tokens.text.currentWordHex),
    };
  }

  if (showEphemeralCongrats) {
    return {
      text: 'Уровень пройден',
      color: hexToColorNumber(visualSystem.tokens.text.currentWordCompletedHex),
    };
  }

  return {
    text: '...',
    color: hexToColorNumber(visualSystem.tokens.text.currentWordPlaceholderHex),
  };
}

function resolveProgressRatio(foundTargets: number, totalTargets: number): number {
  if (!Number.isFinite(foundTargets) || !Number.isFinite(totalTargets) || totalTargets <= 0) {
    return 0;
  }

  return clamp(foundTargets / totalTargets, 0, 1);
}

function drawBackgroundScene(
  graphics: Graphics,
  layout: GameLayout,
  visualSystem: VisualSystemModule,
): void {
  const shellTokens = visualSystem.tokens.shell;
  const width = layout.viewport.width;
  const height = layout.viewport.height;
  const baseColor = hexToColorNumber(shellTokens.appBackgroundHex);
  const coolCloudColor = hexToColorNumber(shellTokens.appCloudCoolHex);
  const mintCloudColor = hexToColorNumber(shellTokens.appCloudMintHex);
  const warmCloudColor = hexToColorNumber(shellTokens.appCloudWarmHex);
  const cloudRadius = Math.min(width, height) * 0.22;

  graphics
    .clear()
    .rect(0, 0, width, height)
    .fill({ color: baseColor })
    .circle(width * 0.18, height * 0.16, cloudRadius)
    .fill({ color: coolCloudColor, alpha: 0.42 })
    .circle(width * 0.84, height * 0.22, cloudRadius * 0.84)
    .fill({ color: mintCloudColor, alpha: 0.32 })
    .circle(width * 0.5, height * 0.9, cloudRadius * 1.06)
    .fill({ color: warmCloudColor, alpha: 0.26 });
}

function drawProgressBar(
  graphics: Graphics,
  rect: LayoutRect,
  fillRatio: number,
  pulseFrame: ProgressBarPulseFrame | null,
  progressFillGradient: FillGradient,
  visualSystem: VisualSystemModule,
): void {
  const progressTokens = visualSystem.tokens.progressBar;
  const radius = Math.min(rect.height / 2, 14);
  const clampedFillRatio = clamp(fillRatio, 0, 1);
  const fillWidth = rect.width * clampedFillRatio;

  graphics
    .roundRect(rect.x, rect.y, rect.width, rect.height, radius)
    .fill({
      color: hexToColorNumber(progressTokens.trackFillHex),
      alpha: progressTokens.trackFillAlpha,
    })
    .stroke({
      color: hexToColorNumber(progressTokens.trackStrokeHex),
      width: 2,
      alpha: progressTokens.trackStrokeAlpha,
    });

  if (fillWidth > 0) {
    graphics.roundRect(rect.x, rect.y, fillWidth, rect.height, radius).fill({
      fill: progressFillGradient,
      alpha: 1,
    });
  }

  if (!pulseFrame || fillWidth <= 0) {
    return;
  }

  const glowRadius = Math.max(rect.height * 0.7, rect.height * pulseFrame.glowScale);
  graphics.circle(rect.x + fillWidth, rect.y + rect.height / 2, glowRadius).fill({
    color: hexToColorNumber(progressTokens.glowHex),
    alpha: pulseFrame.glowAlpha,
  });
}

function drawPathTrail(
  graphics: Graphics,
  layout: GameLayout,
  path: readonly GridCellRef[],
  color: number,
  alpha: number,
  width: number,
  nodeRadius: number,
): void {
  if (path.length === 0) {
    return;
  }

  const [firstCell] = path;
  if (!firstCell) {
    return;
  }

  const firstPoint = resolveCellCenter(layout, firstCell);
  graphics.moveTo(firstPoint.x, firstPoint.y);

  for (let index = 1; index < path.length; index += 1) {
    const cell = path[index];
    if (!cell) {
      continue;
    }

    const point = resolveCellCenter(layout, cell);
    graphics.lineTo(point.x, point.y);
  }

  graphics.stroke({
    color,
    width,
    alpha,
    cap: 'round',
    join: 'round',
  });

  for (const cell of path) {
    const point = resolveCellCenter(layout, cell);
    graphics.circle(point.x, point.y, nodeRadius).fill({ color, alpha: alpha * 0.82 });
  }
}

function addToBoundedSet(
  storage: Set<string>,
  queue: string[],
  value: string,
  maxSize: number,
): void {
  if (storage.has(value)) {
    return;
  }

  storage.add(value);
  queue.push(value);

  if (queue.length <= maxSize) {
    return;
  }

  const removed = queue.shift();
  if (removed) {
    storage.delete(removed);
  }
}

function buildDevTargetWordsSignature(
  levelId: string,
  targetWords: readonly string[],
  foundTargets: readonly string[],
): string {
  return JSON.stringify([levelId, targetWords, foundTargets]);
}

function resolveHintPreviewPath(
  grid: readonly string[],
  targetWords: readonly string[],
  foundTargets: readonly string[],
  currentDisplayedTargetId: string | null,
  currentHintPathProgress: number,
): readonly GridCellRef[] {
  const remainingTargets = sortWordsByDifficulty(
    targetWords.filter((targetWord) => !foundTargets.includes(targetWord)),
  );

  if (remainingTargets.length === 0) {
    return [];
  }

  const hintTargetWord =
    currentDisplayedTargetId && remainingTargets.includes(currentDisplayedTargetId)
      ? currentDisplayedTargetId
      : (remainingTargets[0] ?? null);

  if (!hintTargetWord) {
    return [];
  }

  const hintRevealCount = Number.isSafeInteger(currentHintPathProgress)
    ? clamp(Math.trunc(currentHintPathProgress), 1, hintTargetWord.length)
    : 0;

  if (hintRevealCount <= 0) {
    return [];
  }

  const fullPath = findWordPathInGrid(grid, hintTargetWord);
  if (!fullPath) {
    return [];
  }

  return fullPath.slice(0, hintRevealCount);
}

function createRenderButton(
  id: VisualButtonId,
  labelText: string,
  onTap: () => void,
  visualSystem: VisualSystemModule,
): RenderButton {
  const baseState = visualSystem.resolveButtonState(id, 'base');
  const renderState = buttonContractToRenderState(baseState);
  const container = new Container();
  const glow = new Graphics();
  const background = new Graphics();
  const label = new Text({
    text: labelText,
    style: {
      fontFamily: visualSystem.tokens.typography.fontFamily,
      fontSize: 20,
      fontWeight: '700',
      fill: renderState.labelColor,
      align: 'center',
    },
  });

  label.anchor.set(0.5);
  container.eventMode = 'static';
  container.cursor = 'pointer';
  container.addChild(glow, background, label);
  container.on('pointertap', () => onTap());

  return {
    id,
    container,
    glow,
    background,
    label,
    isEnabled: true,
    isHovered: false,
    isPressed: false,
    renderState,
    targetState: 'base',
    animation: null,
  };
}

export function createRenderMotionModule(
  readModel: ApplicationReadModel,
  commandBus: ApplicationCommandBus,
  eventBus: ApplicationEventBus,
  visualSystem: VisualSystemModule = createVisualSystemModule(),
): RenderMotionModule {
  return {
    moduleName: MODULE_IDS.renderMotion,
    mount: async (rootElement) => {
      const app = new Application();

      await app.init({
        width: GAME_VIEWPORT.width,
        height: GAME_VIEWPORT.height,
        antialias: true,
        backgroundColor: new Color(visualSystem.tokens.shell.appBackgroundHex).toNumber(),
        preserveDrawingBuffer: true,
        resizeTo: rootElement,
      });

      app.canvas.setAttribute('aria-label', 'Game canvas');
      rootElement.appendChild(app.canvas);

      const backgroundLayer = new Graphics();
      const hudLayer = new Graphics();
      const gridLayer = new Graphics();
      const hintLayer = new Graphics();
      const successLayer = new Graphics();
      const dragLayer = new Graphics();
      const undoLayer = new Graphics();
      const controlsLayer = new Graphics();
      const toastLayer = new Graphics();
      const flightsLayer = new Container();
      const buttonLayer = new Container();
      const textLayer = new Container();
      const progressFillGradient = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        textureSpace: 'local',
        colorStops: [
          { offset: 0, color: visualSystem.tokens.accents.progressStartHex },
          { offset: 1, color: visualSystem.tokens.accents.progressEndHex },
        ],
      });
      const currentWordOutgoingBlur = new BlurFilter({
        strength: visualSystem.tokens.currentWord.blurStrength,
        quality: 2,
      });
      const currentWordIncomingBlur = new BlurFilter({
        strength: visualSystem.tokens.currentWord.blurStrength,
        quality: 2,
      });

      const progressCountText = new Text({
        text: '0 / 0',
        style: {
          fontFamily: visualSystem.tokens.typography.fontFamily,
          fontSize: 20,
          fontWeight: '700',
          fill: hexToColorNumber(visualSystem.tokens.text.progressCounterHex),
        },
      });
      progressCountText.anchor.set(0, 1);

      const scoreLabelText = new Text({
        text: 'Счёт',
        style: {
          fontFamily: visualSystem.tokens.typography.fontFamily,
          fontSize: 14,
          fontWeight: '700',
          fill: hexToColorNumber(visualSystem.tokens.text.scoreLabelHex),
          align: 'right',
        },
      });
      scoreLabelText.anchor.set(1, 0);

      const scoreValueText = new Text({
        text: '0',
        style: {
          fontFamily: visualSystem.tokens.typography.fontFamily,
          fontSize: 28,
          fontWeight: '700',
          fill: hexToColorNumber(visualSystem.tokens.text.scoreValueHex),
          align: 'right',
        },
      });
      scoreValueText.anchor.set(1, 1);

      const currentWordPrimaryText = new Text({
        text: '',
        style: {
          fontFamily: visualSystem.tokens.typography.fontFamily,
          fontSize: 30,
          fontWeight: '700',
          fill: hexToColorNumber(visualSystem.tokens.text.currentWordHex),
          align: 'center',
          wordWrap: true,
          wordWrapWidth: 260,
        },
      });
      currentWordPrimaryText.anchor.set(0.5);
      currentWordPrimaryText.filters = [currentWordIncomingBlur];

      const currentWordSecondaryText = new Text({
        text: '',
        style: {
          fontFamily: visualSystem.tokens.typography.fontFamily,
          fontSize: 30,
          fontWeight: '700',
          fill: hexToColorNumber(visualSystem.tokens.text.currentWordHex),
          align: 'center',
          wordWrap: true,
          wordWrapWidth: 260,
        },
      });
      currentWordSecondaryText.anchor.set(0.5);
      currentWordSecondaryText.filters = [currentWordOutgoingBlur];
      currentWordSecondaryText.visible = false;

      const congratsText = new Text({
        text: 'Уровень пройден',
        style: {
          fontFamily: visualSystem.tokens.typography.fontFamily,
          fontSize: 28,
          fontWeight: '700',
          fill: hexToColorNumber(visualSystem.tokens.text.currentWordCompletedHex),
          align: 'center',
        },
      });
      congratsText.anchor.set(0.5);
      congratsText.visible = false;

      const toastText = new Text({
        text: '',
        style: {
          fontFamily: visualSystem.tokens.typography.fontFamily,
          fontSize: 21,
          fontWeight: '700',
          fill: hexToColorNumber(visualSystem.tokens.text.toastHex),
          align: 'center',
        },
      });
      toastText.anchor.set(0.5);
      toastText.visible = false;

      const letterTexts = Array.from({ length: GRID_CELL_COUNT }, () => {
        const letterText = new Text({
          text: '',
          style: {
            fontFamily: visualSystem.tokens.typography.fontFamily,
            fontSize: 44,
            fontWeight: '700',
            fill: hexToColorNumber(visualSystem.tokens.text.letterHex),
            align: 'center',
          },
        });
        letterText.anchor.set(0.5);
        return letterText;
      });

      const dispatchCommand = (
        type: 'RequestHint' | 'RequestReshuffle' | 'SyncLeaderboard',
      ): void => {
        commandBus.dispatch({ type });
      };

      const hintButton = createRenderButton(
        'hint',
        'Подсказка',
        () => {
          if (hintButton.isEnabled) {
            dispatchCommand('RequestHint');
          }
        },
        visualSystem,
      );
      const reshuffleButton = createRenderButton(
        'reshuffle',
        'Пересобрать',
        () => {
          if (reshuffleButton.isEnabled) {
            dispatchCommand('RequestReshuffle');
          }
        },
        visualSystem,
      );
      const leaderboardButton = createRenderButton(
        'leaderboard',
        'Лидерборд',
        () => {
          if (leaderboardButton.isEnabled) {
            dispatchCommand('SyncLeaderboard');
          }
        },
        visualSystem,
      );
      const buttons = [hintButton, reshuffleButton, leaderboardButton] as const;

      buttonLayer.addChild(
        hintButton.container,
        reshuffleButton.container,
        leaderboardButton.container,
      );
      textLayer.addChild(
        progressCountText,
        scoreLabelText,
        scoreValueText,
        currentWordSecondaryText,
        currentWordPrimaryText,
        congratsText,
        toastText,
        ...letterTexts,
      );

      app.stage.addChild(
        backgroundLayer,
        hudLayer,
        gridLayer,
        hintLayer,
        successLayer,
        dragLayer,
        undoLayer,
        controlsLayer,
        toastLayer,
        flightsLayer,
        buttonLayer,
        textLayer,
      );

      let currentLayout = visualSystem.computeLayout(app.screen.width, app.screen.height);
      let activePath: readonly GridCellRef[] = [];
      let undoPulse: UndoPulse | null = null;
      let toastMessage: { text: string; remainingMs: number } | null = null;
      let latestCoreState = readModel.getCoreState();
      let latestHelpState = readModel.getHelpWindowState();
      let displayedTargetWord = latestCoreState.gameState.currentDisplayedTargetId;
      let displayedProgressRatio = resolveProgressRatio(
        latestCoreState.gameplay.progress.foundTargets,
        latestCoreState.gameplay.progress.totalTargets,
      );
      let progressBarAnimation: ProgressBarAnimation | null = null;
      let progressBarPulse: ProgressBarPulseAnimation | null = null;
      let focusedButtonId: VisualButtonId | null = null;
      let currentWordTransition: CurrentWordTransition | null = null;
      let lastDevTargetWordsSignature: string | null = null;
      let currentWordVisual = resolveCurrentWordVisual(
        displayedTargetWord,
        latestCoreState.gameplay.showEphemeralCongrats,
        visualSystem,
      );

      const pathGlowAnimations: PathGlowAnimation[] = [];
      const flyingLetterAnimations: FlyingLetterAnimation[] = [];
      const pendingWordAcknowledge = new Map<string, PendingAcknowledgeJob>();
      const pendingLevelTransitionAcknowledge = new Map<string, PendingAcknowledgeJob>();
      const acknowledgedWordOperations = new Set<string>();
      const acknowledgedWordQueue: string[] = [];
      const acknowledgedTransitionOperations = new Set<string>();
      const acknowledgedTransitionQueue: string[] = [];

      const syncButtonVisualState = (
        button: RenderButton,
        rect: LayoutRect,
        enabled: boolean,
        labelText: string,
        deltaMs: number,
      ): void => {
        if (!enabled) {
          button.isHovered = false;
          button.isPressed = false;
          if (focusedButtonId === button.id) {
            focusedButtonId = null;
          }
        }

        const nextState: VisualButtonState = !enabled
          ? 'disabled'
          : button.isPressed
            ? 'pressed'
            : focusedButtonId === button.id
              ? 'focus'
              : button.isHovered
                ? 'hover'
                : 'base';
        if (nextState !== button.targetState) {
          const durationMs =
            nextState === 'pressed' || button.targetState === 'pressed'
              ? visualSystem.tokens.motion.buttonPressDurationMs
              : visualSystem.tokens.motion.buttonHoverDurationMs;
          button.targetState = nextState;
          button.animation = {
            from: button.renderState,
            to: buttonContractToRenderState(visualSystem.resolveButtonState(button.id, nextState)),
            durationMs,
            elapsedMs: 0,
          };
        }

        if (button.animation) {
          button.animation.elapsedMs += deltaMs;
          const animationProgress = clamp(
            button.animation.elapsedMs / button.animation.durationMs,
            0,
            1,
          );
          button.renderState = interpolateButtonRenderState(
            button.animation.from,
            button.animation.to,
            easeOutCubic(animationProgress),
          );
          if (animationProgress >= 1) {
            button.animation = null;
          }
        }

        button.isEnabled = enabled;
        button.container.eventMode = enabled ? 'static' : 'none';
        button.container.cursor = enabled ? 'pointer' : 'default';
        button.container.position.set(rect.x, rect.y + button.renderState.offsetY);
        button.label.text = labelText;
        button.label.position.set(rect.width / 2, rect.height / 2);
        button.label.style.fontSize = rect.height < 50 ? 18 : 20;
        button.label.alpha = button.renderState.labelAlpha;
        button.label.tint = button.renderState.labelColor;

        const glowRadius = Math.min(rect.height, rect.width) * 0.3 + 4;
        button.glow.clear();
        if (button.renderState.glowAlpha > 0) {
          button.glow.roundRect(-3, -3, rect.width + 6, rect.height + 6, glowRadius).stroke({
            color: button.renderState.strokeColor,
            width: 2,
            alpha: button.renderState.glowAlpha,
          });
        }

        button.background
          .clear()
          .roundRect(0, 0, rect.width, rect.height, Math.min(rect.height, rect.width) * 0.3)
          .fill({
            color: button.renderState.fillColor,
            alpha: button.renderState.fillAlpha,
          })
          .stroke({
            color: button.renderState.strokeColor,
            width: 2,
            alpha: button.renderState.strokeAlpha,
          });
      };

      for (const button of buttons) {
        button.container.on('pointerover', () => {
          if (button.isEnabled) {
            button.isHovered = true;
          }
        });
        button.container.on('pointerout', () => {
          button.isHovered = false;
          button.isPressed = false;
        });
        button.container.on('pointerdown', () => {
          if (!button.isEnabled) {
            return;
          }

          button.isPressed = true;
          focusedButtonId = button.id;
        });
        button.container.on('pointerup', () => {
          button.isPressed = false;
        });
        button.container.on('pointerupoutside', () => {
          button.isPressed = false;
        });
      }

      const resolveFlightTargetPoint = (kind: SuccessKind): { x: number; y: number } => {
        if (kind === 'target') {
          const fillWidth = currentLayout.progressBar.width * displayedProgressRatio;
          return {
            x:
              currentLayout.progressBar.x +
              Math.max(fillWidth, currentLayout.progressBar.height * 0.8),
            y: currentLayout.progressBar.y + currentLayout.progressBar.height / 2,
          };
        }

        return {
          x:
            scoreValueText.x -
            Math.min(scoreValueText.width * 0.45, currentLayout.scoreCard.width * 0.2),
          y: scoreValueText.y,
        };
      };

      const queueFlyingLetters = (
        word: string,
        pathCells: readonly GridCellRef[],
        kind: SuccessKind,
      ): void => {
        if (word.length === 0 || pathCells.length === 0) {
          return;
        }

        const letters = [...word];
        const letterCount = Math.min(letters.length, pathCells.length);
        const target = resolveFlightTargetPoint(kind);
        const tint = hexToColorNumber(
          kind === 'target'
            ? visualSystem.tokens.feedback.targetParticleHex
            : visualSystem.tokens.feedback.bonusParticleHex,
        );

        for (let letterIndex = 0; letterIndex < letterCount; letterIndex += 1) {
          const cell = pathCells[letterIndex];
          const letter = letters[letterIndex];
          if (!cell || !letter) {
            continue;
          }

          const from = resolveCellCenter(currentLayout, cell);
          const sprite = new Text({
            text: letter,
            style: {
              fontFamily: visualSystem.tokens.typography.fontFamily,
              fontSize: 34,
              fontWeight: '700',
              fill: tint,
              align: 'center',
            },
          });
          sprite.anchor.set(0.5);
          sprite.position.set(from.x, from.y);

          flightsLayer.addChild(sprite);
          flyingLetterAnimations.push({
            sprite,
            from,
            to: target,
            delayMs: letterIndex * 55,
            durationMs: 420,
            elapsedMs: 0,
          });
        }
      };

      const scheduleWordSuccessAcknowledge = (operationId: string, wordId: string): void => {
        if (
          pendingWordAcknowledge.has(operationId) ||
          acknowledgedWordOperations.has(operationId)
        ) {
          return;
        }

        pendingWordAcknowledge.set(operationId, {
          operationId,
          delayMs: WORD_SUCCESS_ACK_DELAY_MS,
          wordId,
          elapsedMs: 0,
        });
      };

      const scheduleLevelTransitionAcknowledge = (operationId: string): void => {
        if (
          pendingLevelTransitionAcknowledge.has(operationId) ||
          acknowledgedTransitionOperations.has(operationId)
        ) {
          return;
        }

        pendingLevelTransitionAcknowledge.set(operationId, {
          operationId,
          delayMs: LEVEL_TRANSITION_ACK_DELAY_MS,
          wordId: operationId,
          elapsedMs: 0,
        });
      };

      const handleDomainEvent = (event: ApplicationEvent): void => {
        if (
          event.eventType === 'domain/target-word-accepted' ||
          event.eventType === 'domain/bonus-word-accepted'
        ) {
          const kind: SuccessKind =
            event.eventType === 'domain/target-word-accepted' ? 'target' : 'bonus';
          const color = hexToColorNumber(
            kind === 'target'
              ? visualSystem.tokens.feedback.targetPathHex
              : visualSystem.tokens.feedback.bonusPathHex,
          );

          if (event.eventType === 'domain/target-word-accepted') {
            const payload = event.payload;
            pathGlowAnimations.push({
              kind,
              pathCells: payload.pathCells,
              color,
              elapsedMs: 0,
              durationMs: 520,
            });

            if (payload.wordSuccessOperationId) {
              const normalizedWord = payload.targetWord || payload.wordSuccessOperationId;
              scheduleWordSuccessAcknowledge(payload.wordSuccessOperationId, normalizedWord);
            }
            return;
          }

          const payload = event.payload;
          pathGlowAnimations.push({
            kind,
            pathCells: payload.pathCells,
            color,
            elapsedMs: 0,
            durationMs: 520,
          });
          queueFlyingLetters(payload.bonusWord, payload.pathCells, kind);
          return;
        }

        if (event.eventType === 'domain/progress-bar-fill-requested') {
          progressBarAnimation = {
            fromRatio: resolveProgressRatio(
              event.payload.progress.previousFoundTargets,
              event.payload.progress.totalTargets,
            ),
            toRatio: resolveProgressRatio(
              event.payload.progress.foundTargets,
              event.payload.progress.totalTargets,
            ),
            durationMs: visualSystem.tokens.motion.progressBarFillDurationMs.recommended,
            elapsedMs: 0,
          };
          displayedProgressRatio = progressBarAnimation.fromRatio;
          progressBarPulse = null;
          queueFlyingLetters(event.payload.targetWord, event.payload.pathCells, 'target');
          return;
        }

        if (event.eventType !== 'domain/help-action-failed') {
          return;
        }

        if (event.payload.toastMessage) {
          toastMessage = {
            text: event.payload.toastMessage,
            remainingMs: TOAST_DURATION_MS,
          };
        }
      };

      const unsubscribeEvents = eventBus.subscribe(handleDomainEvent);

      const updatePendingAcknowledgeJobs = (deltaMs: number): void => {
        for (const [operationId, job] of pendingWordAcknowledge.entries()) {
          job.elapsedMs += deltaMs;
          if (job.elapsedMs < job.delayMs) {
            continue;
          }

          commandBus.dispatch({
            type: 'AcknowledgeWordSuccessAnimation',
            wordId: job.wordId,
            operationId,
          });

          addToBoundedSet(
            acknowledgedWordOperations,
            acknowledgedWordQueue,
            operationId,
            MAX_ACK_TRACKING,
          );
          pendingWordAcknowledge.delete(operationId);
        }

        const pendingTransitionOperationId =
          latestCoreState.gameplay.pendingLevelTransitionOperationId;
        if (pendingTransitionOperationId) {
          scheduleLevelTransitionAcknowledge(pendingTransitionOperationId);
        }

        for (const [operationId, job] of pendingLevelTransitionAcknowledge.entries()) {
          job.elapsedMs += deltaMs;
          if (job.elapsedMs < job.delayMs) {
            continue;
          }

          commandBus.dispatch({
            type: 'AcknowledgeLevelTransitionDone',
            operationId,
          });

          addToBoundedSet(
            acknowledgedTransitionOperations,
            acknowledgedTransitionQueue,
            operationId,
            MAX_ACK_TRACKING,
          );
          pendingLevelTransitionAcknowledge.delete(operationId);
        }
      };

      const logDevTargetWordsToConsole = (): void => {
        if (!DEV_TARGET_WORDS_CONSOLE_LOG_ENABLED) {
          return;
        }

        const levelSession = latestCoreState.gameState.currentLevelSession;
        const signature = buildDevTargetWordsSignature(
          levelSession.levelId,
          levelSession.targetWords,
          levelSession.foundTargets,
        );

        if (signature === lastDevTargetWordsSignature) {
          return;
        }

        lastDevTargetWordsSignature = signature;
        const foundTargetSet = new Set(levelSession.foundTargets);

        console.info(DEV_TARGET_WORDS_CONSOLE_PREFIX, {
          levelId: levelSession.levelId,
          words: levelSession.targetWords.map((word) => ({
            word,
            found: foundTargetSet.has(word),
          })),
        });
      };

      const syncDisplayedTargetWord = (): void => {
        if (latestCoreState.gameplay.pendingWordSuccessOperationId) {
          return;
        }

        const nextDisplayedTargetWord = latestCoreState.gameState.currentDisplayedTargetId;
        if (nextDisplayedTargetWord === displayedTargetWord) {
          return;
        }

        const nextVisual = resolveCurrentWordVisual(
          nextDisplayedTargetWord,
          latestCoreState.gameplay.showEphemeralCongrats,
          visualSystem,
        );
        currentWordTransition = {
          from: currentWordVisual,
          to: nextVisual,
          durationMs: visualSystem.tokens.motion.targetWordTransitionDurationMs.recommended,
          elapsedMs: 0,
        };
        currentWordVisual = nextVisual;
        displayedTargetWord = nextDisplayedTargetWord;
      };

      const updateProgressVisuals = (deltaMs: number): ProgressBarPulseFrame | null => {
        const latestProgressRatio = resolveProgressRatio(
          latestCoreState.gameplay.progress.foundTargets,
          latestCoreState.gameplay.progress.totalTargets,
        );

        if (progressBarAnimation) {
          progressBarAnimation.elapsedMs += deltaMs;
          const animationProgress = clamp(
            progressBarAnimation.elapsedMs / progressBarAnimation.durationMs,
            0,
            1,
          );
          displayedProgressRatio = lerp(
            progressBarAnimation.fromRatio,
            progressBarAnimation.toRatio,
            easeOutCubic(animationProgress),
          );

          if (animationProgress >= 1) {
            displayedProgressRatio = progressBarAnimation.toRatio;
            progressBarPulse = {
              ratio: progressBarAnimation.toRatio,
              durationMs: visualSystem.tokens.motion.progressBarPulseDurationMs,
              elapsedMs: 0,
            };
            progressBarAnimation = null;
          }
        } else {
          displayedProgressRatio = latestProgressRatio;
        }

        if (!progressBarPulse) {
          return null;
        }

        progressBarPulse.elapsedMs += deltaMs;
        const pulseProgress = clamp(progressBarPulse.elapsedMs / progressBarPulse.durationMs, 0, 1);
        const pulseFrame = visualSystem.resolveProgressBarPulse(pulseProgress);
        if (pulseProgress >= 1) {
          progressBarPulse = null;
        }

        return pulseFrame;
      };

      const updateCurrentWordTransition = (deltaMs: number): CurrentWordTransitionFrame | null => {
        if (!currentWordTransition) {
          return null;
        }

        currentWordTransition.elapsedMs += deltaMs;
        const transitionProgress = clamp(
          currentWordTransition.elapsedMs / currentWordTransition.durationMs,
          0,
          1,
        );
        const transitionFrame = visualSystem.resolveCurrentWordTransition(transitionProgress);
        if (transitionProgress >= 1) {
          currentWordTransition = null;
        }

        return transitionFrame;
      };

      const renderFrame = (deltaMs: number): void => {
        latestCoreState = readModel.getCoreState();
        latestHelpState = readModel.getHelpWindowState();
        currentLayout = visualSystem.computeLayout(app.screen.width, app.screen.height);
        updatePendingAcknowledgeJobs(deltaMs);
        latestCoreState = readModel.getCoreState();
        latestHelpState = readModel.getHelpWindowState();
        syncDisplayedTargetWord();
        logDevTargetWordsToConsole();
        const progressPulseFrame = updateProgressVisuals(deltaMs);
        const currentWordTransitionSnapshot = currentWordTransition;
        const currentWordTransitionFrame = updateCurrentWordTransition(deltaMs);

        drawBackgroundScene(backgroundLayer, currentLayout, visualSystem);

        hudLayer.clear();
        drawPanelContract(
          hudLayer,
          currentLayout.progressCard,
          22,
          visualSystem.tokens.panels.metric,
        );
        drawPanelContract(hudLayer, currentLayout.scoreCard, 22, visualSystem.tokens.panels.metric);
        drawPanelContract(
          hudLayer,
          currentLayout.currentWord,
          24,
          visualSystem.tokens.panels.currentWord,
        );
        drawProgressBar(
          hudLayer,
          currentLayout.progressBar,
          displayedProgressRatio,
          progressPulseFrame,
          progressFillGradient,
          visualSystem,
        );

        const isCompactHud = currentLayout.progressCard.height < 78;
        const currentWordFontSize =
          currentLayout.currentWord.height < 54
            ? 22
            : currentLayout.currentWord.height < 64
              ? 24
              : currentLayout.currentWord.height < 72
                ? 28
                : 32;
        progressCountText.style.fontSize = isCompactHud ? 18 : 20;
        scoreLabelText.style.fontSize = isCompactHud ? 12 : 14;
        scoreValueText.style.fontSize = isCompactHud ? 24 : 30;
        currentWordPrimaryText.style.fontSize = currentWordFontSize;
        currentWordSecondaryText.style.fontSize = currentWordPrimaryText.style.fontSize;
        currentWordPrimaryText.style.wordWrapWidth = currentLayout.currentWord.width * 0.82;
        currentWordSecondaryText.style.wordWrapWidth = currentWordPrimaryText.style.wordWrapWidth;

        progressCountText.text = `${latestCoreState.gameplay.progress.foundTargets} / ${latestCoreState.gameplay.progress.totalTargets}`;
        progressCountText.position.set(
          currentLayout.progressAnchor.x,
          currentLayout.progressCard.y + currentLayout.progressCard.height - 14,
        );

        scoreLabelText.position.set(currentLayout.scoreAnchor.x, currentLayout.scoreCard.y + 12);
        scoreValueText.text = `${latestCoreState.gameplay.allTimeScore}`;
        scoreValueText.position.set(
          currentLayout.scoreAnchor.x,
          currentLayout.scoreCard.y + currentLayout.scoreCard.height - 12,
        );

        const currentWordCenterX =
          currentLayout.currentWord.x + currentLayout.currentWord.width / 2;
        const currentWordCenterY =
          currentLayout.currentWord.y + currentLayout.currentWord.height / 2;
        currentWordPrimaryText.position.set(currentWordCenterX, currentWordCenterY);
        currentWordSecondaryText.position.set(currentWordCenterX, currentWordCenterY);

        if (currentWordTransitionSnapshot && currentWordTransitionFrame) {
          currentWordSecondaryText.visible = true;
          currentWordSecondaryText.text = currentWordTransitionSnapshot.from.text;
          currentWordSecondaryText.tint = currentWordTransitionSnapshot.from.color;
          currentWordSecondaryText.alpha = currentWordTransitionFrame.outgoingAlpha;
          currentWordOutgoingBlur.strength = currentWordTransitionFrame.outgoingBlurStrength;

          currentWordPrimaryText.text = currentWordTransitionSnapshot.to.text;
          currentWordPrimaryText.tint = currentWordTransitionSnapshot.to.color;
          currentWordPrimaryText.alpha = currentWordTransitionFrame.incomingAlpha;
          currentWordIncomingBlur.strength = currentWordTransitionFrame.incomingBlurStrength;
        } else {
          currentWordSecondaryText.visible = false;
          currentWordSecondaryText.alpha = 0;
          currentWordOutgoingBlur.strength = 0;

          currentWordPrimaryText.text = currentWordVisual.text;
          currentWordPrimaryText.tint = currentWordVisual.color;
          currentWordPrimaryText.alpha = 1;
          currentWordIncomingBlur.strength = 0;
        }

        const helpButtonsEnabled =
          !latestCoreState.gameplay.isInputLocked &&
          !latestCoreState.gameState.helpLockState.isLocked;
        const hintLabel = 'Подсказка';
        const reshuffleLabel = 'Пересобрать';

        controlsLayer.clear();
        drawPanelContract(
          controlsLayer,
          currentLayout.controls,
          22,
          visualSystem.tokens.panels.controls,
        );

        syncButtonVisualState(
          hintButton,
          currentLayout.buttons.hint,
          helpButtonsEnabled,
          hintLabel,
          deltaMs,
        );
        syncButtonVisualState(
          reshuffleButton,
          currentLayout.buttons.reshuffle,
          helpButtonsEnabled,
          reshuffleLabel,
          deltaMs,
        );
        syncButtonVisualState(
          leaderboardButton,
          currentLayout.buttons.leaderboard,
          true,
          'Лидерборд',
          deltaMs,
        );

        const grid = latestCoreState.gameState.currentLevelSession.grid;
        const activePathIndices = new Set(
          activePath.map((cell) => toGridCellIndex(cell.row, cell.col)),
        );

        gridLayer.clear();
        drawPanelContract(gridLayer, currentLayout.grid, 26, visualSystem.tokens.grid.panel);

        for (let row = 0; row < GRID_SIZE; row += 1) {
          for (let col = 0; col < GRID_SIZE; col += 1) {
            const cellIndex = toGridCellIndex(row, col);
            const cellBounds = resolveCellBounds(currentLayout, row, col);
            const cellPadding = Math.max(2, cellBounds.width * 0.05);
            const isPathCell = activePathIndices.has(cellIndex);
            const cellFill = hexToColorNumber(
              isPathCell
                ? visualSystem.tokens.grid.cellActiveFillHex
                : visualSystem.tokens.grid.cellFillHex,
            );
            const cellStroke = hexToColorNumber(
              isPathCell
                ? visualSystem.tokens.grid.cellActiveStrokeHex
                : visualSystem.tokens.grid.cellStrokeHex,
            );
            const cellFillAlpha = isPathCell
              ? visualSystem.tokens.grid.cellActiveFillAlpha
              : visualSystem.tokens.grid.cellFillAlpha;
            const cellStrokeAlpha = isPathCell
              ? visualSystem.tokens.grid.cellActiveStrokeAlpha
              : visualSystem.tokens.grid.cellStrokeAlpha;

            gridLayer
              .roundRect(
                cellBounds.x + cellPadding,
                cellBounds.y + cellPadding,
                cellBounds.width - cellPadding * 2,
                cellBounds.height - cellPadding * 2,
                Math.max(8, cellBounds.width * 0.15),
              )
              .fill({ color: cellFill, alpha: cellFillAlpha })
              .stroke({ color: cellStroke, width: 2, alpha: cellStrokeAlpha });

            const letterText = letterTexts[cellIndex];
            if (!letterText) {
              continue;
            }

            const letter = grid[cellIndex] ?? '';
            letterText.text = letter;
            letterText.position.set(
              cellBounds.x + cellBounds.width / 2,
              cellBounds.y + cellBounds.height / 2,
            );
            letterText.tint = hexToColorNumber(
              isPathCell
                ? visualSystem.tokens.text.activeLetterHex
                : visualSystem.tokens.text.letterHex,
            );
            letterText.alpha = isPathCell ? 1 : 0.95;
          }
        }

        const hintPath = resolveHintPreviewPath(
          latestCoreState.gameState.currentLevelSession.grid,
          latestCoreState.gameState.currentLevelSession.targetWords,
          latestCoreState.gameState.currentLevelSession.foundTargets,
          latestCoreState.gameState.currentDisplayedTargetId,
          latestCoreState.gameState.currentHintPathProgress,
        );

        hintLayer.clear();
        if (hintPath.length > 0) {
          const hintRadius = (currentLayout.grid.width / GRID_SIZE) * 0.19;
          for (const cell of hintPath) {
            const center = resolveCellCenter(currentLayout, cell);
            hintLayer
              .circle(center.x, center.y, hintRadius)
              .fill({
                color: hexToColorNumber(visualSystem.tokens.grid.hintFillHex),
                alpha: visualSystem.tokens.grid.hintFillAlpha,
              })
              .stroke({
                color: hexToColorNumber(visualSystem.tokens.grid.hintStrokeHex),
                width: 2,
                alpha: visualSystem.tokens.grid.hintStrokeAlpha,
              });
          }
        }

        dragLayer.clear();
        if (activePath.length > 0) {
          const cellSize = currentLayout.grid.width / GRID_SIZE;
          drawPathTrail(
            dragLayer,
            currentLayout,
            activePath,
            hexToColorNumber(visualSystem.tokens.grid.pathHex),
            0.56,
            cellSize * 0.28,
            cellSize * 0.2,
          );
        }

        undoLayer.clear();
        if (undoPulse) {
          undoPulse.elapsedMs += deltaMs;
          const progress = clamp(undoPulse.elapsedMs / undoPulse.durationMs, 0, 1);
          const center = resolveCellCenter(currentLayout, undoPulse.cell);
          const radius = (currentLayout.grid.width / GRID_SIZE) * (0.2 + progress * 0.2);
          undoLayer.circle(center.x, center.y, radius).stroke({
            color: hexToColorNumber(visualSystem.tokens.grid.undoStrokeHex),
            width: 2,
            alpha: (1 - progress) * 0.8,
          });

          if (progress >= 1) {
            undoPulse = null;
          }
        }

        successLayer.clear();
        for (let index = pathGlowAnimations.length - 1; index >= 0; index -= 1) {
          const animation = pathGlowAnimations[index];
          if (!animation) {
            continue;
          }

          animation.elapsedMs += deltaMs;
          const progress = clamp(animation.elapsedMs / animation.durationMs, 0, 1);
          const alpha = (1 - progress) * 0.85;

          if (alpha <= 0) {
            pathGlowAnimations.splice(index, 1);
            continue;
          }

          const cellSize = currentLayout.grid.width / GRID_SIZE;
          drawPathTrail(
            successLayer,
            currentLayout,
            animation.pathCells,
            animation.color,
            alpha,
            cellSize * 0.32,
            cellSize * 0.23,
          );
        }

        for (let index = flyingLetterAnimations.length - 1; index >= 0; index -= 1) {
          const animation = flyingLetterAnimations[index];
          if (!animation) {
            continue;
          }

          animation.elapsedMs += deltaMs;
          if (animation.elapsedMs < animation.delayMs) {
            animation.sprite.visible = false;
            continue;
          }

          animation.sprite.visible = true;
          const normalizedProgress = clamp(
            (animation.elapsedMs - animation.delayMs) / animation.durationMs,
            0,
            1,
          );
          const easedProgress = easeOutCubic(normalizedProgress);
          animation.sprite.position.set(
            lerp(animation.from.x, animation.to.x, easedProgress),
            lerp(animation.from.y, animation.to.y, easedProgress),
          );
          animation.sprite.alpha = 1 - easedProgress * 0.48;
          animation.sprite.scale.set(lerp(1, 0.72, easedProgress));

          if (normalizedProgress >= 1) {
            flightsLayer.removeChild(animation.sprite);
            animation.sprite.destroy();
            flyingLetterAnimations.splice(index, 1);
          }
        }

        toastLayer.clear();
        congratsText.visible = latestCoreState.gameplay.showEphemeralCongrats;
        if (congratsText.visible) {
          congratsText.position.set(
            currentLayout.viewport.width / 2,
            currentLayout.grid.y + currentLayout.grid.height / 2,
          );
          congratsText.alpha = 0.7 + Math.sin(Date.now() / 150) * 0.2;
        }

        if (toastMessage) {
          toastMessage.remainingMs -= deltaMs;
          if (toastMessage.remainingMs <= 0) {
            toastMessage = null;
            toastText.visible = false;
          } else {
            const toastOpacity = clamp(toastMessage.remainingMs / TOAST_DURATION_MS, 0.35, 1);
            toastText.visible = true;
            toastText.text = toastMessage.text;
            toastText.position.set(currentLayout.viewport.width / 2, currentLayout.controls.y - 18);
            toastText.alpha = toastOpacity;
            toastLayer
              .roundRect(
                toastText.x - toastText.width / 2 - 18,
                toastText.y - toastText.height / 2 - 10,
                toastText.width + 36,
                toastText.height + 20,
                18,
              )
              .fill({
                color: hexToColorNumber(visualSystem.tokens.feedback.toastFillHex),
                alpha: visualSystem.tokens.feedback.toastFillAlpha * toastOpacity,
              })
              .stroke({
                color: hexToColorNumber(visualSystem.tokens.feedback.toastStrokeHex),
                width: 2,
                alpha: visualSystem.tokens.feedback.toastStrokeAlpha * toastOpacity,
              });
          }
        } else {
          toastText.visible = false;
        }

        app.render();
      };

      const tickerUpdate = (): void => {
        renderFrame(app.ticker.deltaMS);
      };
      app.ticker.add(tickerUpdate);

      renderFrame(FRAME_DURATION_MS);

      return {
        moduleName: MODULE_IDS.renderMotion,
        canvas: app.canvas,
        stepFrame: () => {
          renderFrame(FRAME_DURATION_MS);
        },
        setInputPath: (nextPath) => {
          if (nextPath.length < activePath.length) {
            const removedCell = activePath.at(-1);
            if (removedCell) {
              undoPulse = {
                cell: removedCell,
                durationMs: 180,
                elapsedMs: 0,
              };
            }
          }

          const changed =
            nextPath.length !== activePath.length ||
            nextPath.some((cell, index) => {
              const previous = activePath[index];
              return !previous || !sameCell(cell, previous);
            });

          if (!changed) {
            return;
          }

          activePath = clonePath(nextPath);
        },
        toTextSnapshot: () => ({
          runtimeMode: latestCoreState.runtimeMode,
          viewport: {
            width: Math.round(app.screen.width),
            height: Math.round(app.screen.height),
            isPortrait: app.screen.height >= app.screen.width,
          },
          layout: currentLayout,
          stageChildren: app.stage.children.length,
          gameplay: {
            levelId: latestCoreState.gameplay.levelId,
            levelStatus: latestCoreState.gameplay.levelStatus,
            grid: {
              side: GRID_SIZE,
              letters: [...latestCoreState.gameState.currentLevelSession.grid],
            },
            allTimeScore: latestCoreState.gameplay.allTimeScore,
            displayedTargetWord,
            currentHintPathProgress: latestCoreState.gameState.currentHintPathProgress,
            progress: {
              foundTargets: latestCoreState.gameplay.progress.foundTargets,
              totalTargets: latestCoreState.gameplay.progress.totalTargets,
            },
            isInputLocked: latestCoreState.gameplay.isInputLocked,
            showEphemeralCongrats: latestCoreState.gameplay.showEphemeralCongrats,
          },
          help: {
            isLocked: latestCoreState.gameState.helpLockState.isLocked,
            lockedUntil: latestCoreState.gameState.helpLockState.lockedUntil,
            lockReason: latestCoreState.gameState.helpLockState.reason,
            cooldownMsRemaining: latestHelpState.cooldownMsRemaining,
            cooldownReason: latestHelpState.cooldownReason,
          },
          ui: {
            activePathLength: activePath.length,
            activeGlowAnimations: pathGlowAnimations.length,
            activeFlyingLetters: flyingLetterAnimations.length,
            toastMessage: toastMessage?.text ?? null,
            progressFillRatio: displayedProgressRatio,
            progressFillAnimating: progressBarAnimation !== null,
            currentWordTransitionActive: currentWordTransition !== null,
            focusedButtonId,
            hintEnabled: hintButton.isEnabled,
            reshuffleEnabled: reshuffleButton.isEnabled,
            leaderboardEnabled: leaderboardButton.isEnabled,
          },
        }),
        dispose: async () => {
          unsubscribeEvents();
          app.ticker.remove(tickerUpdate);

          for (const animation of flyingLetterAnimations) {
            flightsLayer.removeChild(animation.sprite);
            animation.sprite.destroy();
          }

          app.destroy(true);
        },
      };
    },
  };
}
