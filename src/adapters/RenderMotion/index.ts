import { Application, Color, Container, Graphics, Text } from 'pixi.js';

import type {
  ApplicationCommandBus,
  ApplicationEvent,
  ApplicationEventBus,
  ApplicationReadModel,
  GridCellRef,
} from '../../application';
import { GAME_VIEWPORT } from '../../config/viewport';
import { computeGameLayout, type GameLayout, type LayoutRect } from '../../shared/game-layout';
import { MODULE_IDS } from '../../shared/module-ids';

const GRID_SIZE = 5;
const GRID_CELL_COUNT = GRID_SIZE * GRID_SIZE;
const FRAME_DURATION_MS = 1000 / 60;
const WORD_SUCCESS_ACK_DELAY_MS = 360;
const LEVEL_TRANSITION_ACK_DELAY_MS = 900;
const TOAST_DURATION_MS = 2_200;
const MAX_ACK_TRACKING = 128;
const HINT_META_TARGET_WORD_KEY = 'hintTargetWord';
const HINT_META_REVEAL_COUNT_KEY = 'hintRevealCount';
const HELP_BUTTON_TOAST_LOCK_TEXT = 'Занято';

type SuccessKind = 'target' | 'bonus';

type RenderButtonId = 'hint' | 'reshuffle' | 'leaderboard';

interface RenderButton {
  readonly id: RenderButtonId;
  readonly container: Container;
  readonly background: Graphics;
  readonly label: Text;
  readonly accentColor: number;
  isEnabled: boolean;
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

export interface RenderMotionSnapshot {
  readonly runtimeMode: string;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
    readonly isPortrait: boolean;
  };
  readonly stageChildren: number;
  readonly gameplay: {
    readonly levelId: string;
    readonly levelStatus: 'active' | 'completed' | 'reshuffling';
    readonly allTimeScore: number;
    readonly progress: {
      readonly foundTargets: number;
      readonly totalTargets: number;
    };
    readonly isInputLocked: boolean;
    readonly showEphemeralCongrats: boolean;
  };
  readonly help: {
    readonly freeActionAvailable: boolean;
    readonly isLocked: boolean;
    readonly cooldownMsRemaining: number;
    readonly cooldownReason: string | null;
  };
  readonly ui: {
    readonly activePathLength: number;
    readonly activeGlowAnimations: number;
    readonly activeFlyingLetters: number;
    readonly toastMessage: string | null;
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

function compareWordDifficulty(left: string, right: string): number {
  if (left.length !== right.length) {
    return left.length - right.length;
  }

  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function findHintPath(grid: readonly string[], targetWord: string): readonly GridCellRef[] | null {
  if (targetWord.length === 0 || grid.length !== GRID_CELL_COUNT) {
    return null;
  }

  const directions = [
    { rowOffset: -1, colOffset: -1 },
    { rowOffset: -1, colOffset: 0 },
    { rowOffset: -1, colOffset: 1 },
    { rowOffset: 0, colOffset: -1 },
    { rowOffset: 0, colOffset: 1 },
    { rowOffset: 1, colOffset: -1 },
    { rowOffset: 1, colOffset: 0 },
    { rowOffset: 1, colOffset: 1 },
  ] as const;

  const path: GridCellRef[] = [];
  const visited = new Set<number>();

  const dfs = (row: number, col: number, letterIndex: number): boolean => {
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
      return false;
    }

    const cellIndex = toGridCellIndex(row, col);
    if (visited.has(cellIndex)) {
      return false;
    }

    if (grid[cellIndex] !== targetWord[letterIndex]) {
      return false;
    }

    visited.add(cellIndex);
    path.push({ row, col });

    if (letterIndex === targetWord.length - 1) {
      return true;
    }

    for (const direction of directions) {
      if (dfs(row + direction.rowOffset, col + direction.colOffset, letterIndex + 1)) {
        return true;
      }
    }

    path.pop();
    visited.delete(cellIndex);
    return false;
  };

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (dfs(row, col, 0)) {
        return [...path];
      }

      path.length = 0;
      visited.clear();
    }
  }

  return null;
}

function resolveHintPreviewPath(
  grid: readonly string[],
  targetWords: readonly string[],
  foundTargets: readonly string[],
  meta: Readonly<Record<string, unknown>>,
): readonly GridCellRef[] {
  const remainingTargets = targetWords
    .filter((targetWord) => !foundTargets.includes(targetWord))
    .sort(compareWordDifficulty);

  if (remainingTargets.length === 0) {
    return [];
  }

  const hintTargetFromMeta = meta[HINT_META_TARGET_WORD_KEY];
  const hintTargetWord =
    typeof hintTargetFromMeta === 'string' && remainingTargets.includes(hintTargetFromMeta)
      ? hintTargetFromMeta
      : (remainingTargets[0] ?? null);

  if (!hintTargetWord) {
    return [];
  }

  const hintRevealRaw = meta[HINT_META_REVEAL_COUNT_KEY];
  const hintRevealCount =
    typeof hintRevealRaw === 'number' && Number.isSafeInteger(hintRevealRaw)
      ? clamp(Math.trunc(hintRevealRaw), 1, hintTargetWord.length)
      : 0;

  if (hintRevealCount <= 0) {
    return [];
  }

  const fullPath = findHintPath(grid, hintTargetWord);
  if (!fullPath) {
    return [];
  }

  return fullPath.slice(0, hintRevealCount);
}

function createRenderButton(
  id: RenderButtonId,
  accentColor: number,
  labelText: string,
  onTap: () => void,
): RenderButton {
  const container = new Container();
  const background = new Graphics();
  const label = new Text({
    text: labelText,
    style: {
      fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
      fontSize: 20,
      fontWeight: '700',
      fill: 0xf8fafc,
      align: 'center',
    },
  });

  label.anchor.set(0.5);
  container.eventMode = 'static';
  container.cursor = 'pointer';
  container.addChild(background, label);
  container.on('pointertap', () => onTap());

  return {
    id,
    container,
    background,
    label,
    accentColor,
    isEnabled: true,
  };
}

export function createRenderMotionModule(
  readModel: ApplicationReadModel,
  commandBus: ApplicationCommandBus,
  eventBus: ApplicationEventBus,
): RenderMotionModule {
  return {
    moduleName: MODULE_IDS.renderMotion,
    mount: async (rootElement) => {
      const app = new Application();

      await app.init({
        width: GAME_VIEWPORT.width,
        height: GAME_VIEWPORT.height,
        antialias: true,
        backgroundColor: new Color('#07101d').toNumber(),
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
      const flightsLayer = new Container();
      const buttonLayer = new Container();
      const textLayer = new Container();

      const progressText = new Text({
        text: 'Цели 0/0',
        style: {
          fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
          fontSize: 34,
          fontWeight: '700',
          fill: 0xdbeafe,
        },
      });
      progressText.anchor.set(0, 0.5);

      const scoreText = new Text({
        text: 'Счёт 0',
        style: {
          fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
          fontSize: 34,
          fontWeight: '700',
          fill: 0xfef9c3,
        },
      });
      scoreText.anchor.set(1, 0.5);

      const congratsText = new Text({
        text: 'Уровень пройден',
        style: {
          fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
          fontSize: 28,
          fontWeight: '700',
          fill: 0x86efac,
          align: 'center',
        },
      });
      congratsText.anchor.set(0.5);
      congratsText.visible = false;

      const toastText = new Text({
        text: '',
        style: {
          fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
          fontSize: 21,
          fontWeight: '700',
          fill: 0xfef3c7,
          align: 'center',
        },
      });
      toastText.anchor.set(0.5);
      toastText.visible = false;

      const letterTexts = Array.from({ length: GRID_CELL_COUNT }, () => {
        const letterText = new Text({
          text: '',
          style: {
            fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
            fontSize: 44,
            fontWeight: '700',
            fill: 0xe2e8f0,
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

      const hintButton = createRenderButton('hint', 0x22c55e, 'Подсказка', () => {
        if (hintButton.isEnabled) {
          dispatchCommand('RequestHint');
        }
      });
      const reshuffleButton = createRenderButton('reshuffle', 0x0284c7, 'Пересобрать', () => {
        if (reshuffleButton.isEnabled) {
          dispatchCommand('RequestReshuffle');
        }
      });
      const leaderboardButton = createRenderButton('leaderboard', 0xf97316, 'Лидерборд', () => {
        if (leaderboardButton.isEnabled) {
          dispatchCommand('SyncLeaderboard');
        }
      });

      buttonLayer.addChild(
        hintButton.container,
        reshuffleButton.container,
        leaderboardButton.container,
      );
      textLayer.addChild(progressText, scoreText, congratsText, toastText, ...letterTexts);

      app.stage.addChild(
        backgroundLayer,
        hudLayer,
        gridLayer,
        hintLayer,
        successLayer,
        dragLayer,
        undoLayer,
        controlsLayer,
        flightsLayer,
        buttonLayer,
        textLayer,
      );

      let currentLayout = computeGameLayout(app.screen.width, app.screen.height);
      let activePath: readonly GridCellRef[] = [];
      let undoPulse: UndoPulse | null = null;
      let toastMessage: { text: string; remainingMs: number } | null = null;
      let latestCoreState = readModel.getCoreState();
      let latestHelpState = readModel.getHelpWindowState();

      const pathGlowAnimations: PathGlowAnimation[] = [];
      const flyingLetterAnimations: FlyingLetterAnimation[] = [];
      const pendingWordAcknowledge = new Map<string, PendingAcknowledgeJob>();
      const pendingLevelTransitionAcknowledge = new Map<string, PendingAcknowledgeJob>();
      const acknowledgedWordOperations = new Set<string>();
      const acknowledgedWordQueue: string[] = [];
      const acknowledgedTransitionOperations = new Set<string>();
      const acknowledgedTransitionQueue: string[] = [];

      const applyButtonVisualState = (
        button: RenderButton,
        rect: LayoutRect,
        enabled: boolean,
        labelText: string,
      ): void => {
        button.isEnabled = enabled;
        button.container.eventMode = enabled ? 'static' : 'none';
        button.container.cursor = enabled ? 'pointer' : 'default';
        button.container.position.set(rect.x, rect.y);
        button.label.text = labelText;
        button.label.position.set(rect.width / 2, rect.height / 2);
        button.label.alpha = enabled ? 1 : 0.82;

        button.background
          .clear()
          .roundRect(0, 0, rect.width, rect.height, Math.min(rect.height, rect.width) * 0.3)
          .fill({
            color: button.accentColor,
            alpha: enabled ? 0.72 : 0.34,
          })
          .stroke({
            color: enabled ? 0xffffff : 0x94a3b8,
            width: 2,
            alpha: enabled ? 0.66 : 0.36,
          });
      };

      const resolveFlightTargetPoint = (kind: SuccessKind): { x: number; y: number } => {
        if (kind === 'target') {
          return {
            x: progressText.x + Math.min(progressText.width + 14, currentLayout.hud.width * 0.36),
            y: progressText.y,
          };
        }

        return {
          x: scoreText.x - Math.min(scoreText.width + 14, currentLayout.hud.width * 0.36),
          y: scoreText.y,
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
        const tint = kind === 'target' ? 0x34d399 : 0xfacc15;

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
              fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
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
        if (event.eventType === 'domain/word-submitted') {
          const payload = event.payload;
          if (payload.isSilent || (payload.result !== 'target' && payload.result !== 'bonus')) {
            return;
          }

          const kind: SuccessKind = payload.result;
          const color = kind === 'target' ? 0x22c55e : 0xfacc15;

          pathGlowAnimations.push({
            kind,
            pathCells: payload.pathCells,
            color,
            elapsedMs: 0,
            durationMs: 520,
          });

          if (payload.normalizedWord) {
            queueFlyingLetters(payload.normalizedWord, payload.pathCells, kind);
          }

          if (payload.wordSuccessOperationId) {
            const normalizedWord = payload.normalizedWord ?? payload.wordSuccessOperationId;
            scheduleWordSuccessAcknowledge(payload.wordSuccessOperationId, normalizedWord);
          }
          return;
        }

        if (event.eventType !== 'domain/help') {
          return;
        }

        if (event.payload.phase === 'ad-result' && event.payload.toastMessage) {
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

      const renderFrame = (deltaMs: number): void => {
        latestCoreState = readModel.getCoreState();
        latestHelpState = readModel.getHelpWindowState();
        currentLayout = computeGameLayout(app.screen.width, app.screen.height);

        updatePendingAcknowledgeJobs(deltaMs);

        backgroundLayer
          .clear()
          .rect(0, 0, currentLayout.viewport.width, currentLayout.viewport.height)
          .fill({ color: 0x07101d })
          .rect(
            0,
            currentLayout.grid.y * 0.45,
            currentLayout.viewport.width,
            currentLayout.viewport.height,
          )
          .fill({ color: 0x0f172a, alpha: 0.8 });

        hudLayer.clear();
        drawPanel(hudLayer, currentLayout.hud, 22, 0x1e293b, 0.78, 0x7dd3fc, 0.26);

        progressText.text = `Цели ${latestCoreState.gameplay.progress.foundTargets}/${latestCoreState.gameplay.progress.totalTargets}`;
        progressText.position.set(currentLayout.progressAnchor.x, currentLayout.progressAnchor.y);

        scoreText.text = `Счёт ${latestCoreState.gameplay.allTimeScore}`;
        scoreText.position.set(currentLayout.scoreAnchor.x, currentLayout.scoreAnchor.y);

        const helpButtonsEnabled =
          !latestCoreState.gameplay.isInputLocked &&
          !latestHelpState.isLocked &&
          latestHelpState.cooldownMsRemaining === 0;
        const cooldownSeconds = Math.ceil(latestHelpState.cooldownMsRemaining / 1000);

        const hintLabel =
          latestHelpState.cooldownMsRemaining > 0
            ? `Подсказка • ${cooldownSeconds}с`
            : latestHelpState.isLocked
              ? `Подсказка • ${HELP_BUTTON_TOAST_LOCK_TEXT}`
              : latestHelpState.freeActionAvailable
                ? 'Подсказка • free'
                : 'Подсказка • ad';
        const reshuffleLabel =
          latestHelpState.cooldownMsRemaining > 0
            ? `Пересобрать • ${cooldownSeconds}с`
            : latestHelpState.isLocked
              ? `Пересобрать • ${HELP_BUTTON_TOAST_LOCK_TEXT}`
              : latestHelpState.freeActionAvailable
                ? 'Пересобрать • free'
                : 'Пересобрать • ad';

        controlsLayer.clear();
        drawPanel(controlsLayer, currentLayout.controls, 22, 0x0b1220, 0.82, 0x93c5fd, 0.22);

        applyButtonVisualState(
          hintButton,
          currentLayout.buttons.hint,
          helpButtonsEnabled,
          hintLabel,
        );
        applyButtonVisualState(
          reshuffleButton,
          currentLayout.buttons.reshuffle,
          helpButtonsEnabled,
          reshuffleLabel,
        );
        applyButtonVisualState(
          leaderboardButton,
          currentLayout.buttons.leaderboard,
          true,
          'Лидерборд',
        );

        const grid = latestCoreState.gameState.currentLevelSession.grid;
        const activePathIndices = new Set(
          activePath.map((cell) => toGridCellIndex(cell.row, cell.col)),
        );

        gridLayer.clear();
        drawPanel(gridLayer, currentLayout.grid, 26, 0x111827, 0.94, 0x67e8f9, 0.28);

        for (let row = 0; row < GRID_SIZE; row += 1) {
          for (let col = 0; col < GRID_SIZE; col += 1) {
            const cellIndex = toGridCellIndex(row, col);
            const cellBounds = resolveCellBounds(currentLayout, row, col);
            const cellPadding = Math.max(2, cellBounds.width * 0.05);
            const isPathCell = activePathIndices.has(cellIndex);
            const cellFill = isPathCell ? 0x164e63 : 0x1f2937;
            const cellStroke = isPathCell ? 0x5eead4 : 0x334155;

            gridLayer
              .roundRect(
                cellBounds.x + cellPadding,
                cellBounds.y + cellPadding,
                cellBounds.width - cellPadding * 2,
                cellBounds.height - cellPadding * 2,
                Math.max(8, cellBounds.width * 0.15),
              )
              .fill({ color: cellFill, alpha: isPathCell ? 0.96 : 0.92 })
              .stroke({ color: cellStroke, width: 2, alpha: isPathCell ? 0.78 : 0.35 });

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
            letterText.tint = isPathCell ? 0xccfbf1 : 0xe2e8f0;
            letterText.alpha = isPathCell ? 1 : 0.95;
          }
        }

        const hintPath = resolveHintPreviewPath(
          latestCoreState.gameState.currentLevelSession.grid,
          latestCoreState.gameState.currentLevelSession.targetWords,
          latestCoreState.gameState.currentLevelSession.foundTargets,
          latestCoreState.gameState.currentLevelSession.meta,
        );

        hintLayer.clear();
        if (hintPath.length > 0) {
          const hintRadius = (currentLayout.grid.width / GRID_SIZE) * 0.19;
          for (const cell of hintPath) {
            const center = resolveCellCenter(currentLayout, cell);
            hintLayer
              .circle(center.x, center.y, hintRadius)
              .fill({ color: 0x38bdf8, alpha: 0.26 })
              .stroke({ color: 0x7dd3fc, width: 2, alpha: 0.44 });
          }
        }

        dragLayer.clear();
        if (activePath.length > 0) {
          const cellSize = currentLayout.grid.width / GRID_SIZE;
          drawPathTrail(
            dragLayer,
            currentLayout,
            activePath,
            0x5eead4,
            0.5,
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
          undoLayer
            .circle(center.x, center.y, radius)
            .stroke({ color: 0x22d3ee, width: 2, alpha: (1 - progress) * 0.8 });

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
            toastText.visible = true;
            toastText.text = toastMessage.text;
            toastText.position.set(currentLayout.viewport.width / 2, currentLayout.controls.y - 18);
            toastText.alpha = clamp(toastMessage.remainingMs / TOAST_DURATION_MS, 0.35, 1);
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
          stageChildren: app.stage.children.length,
          gameplay: {
            levelId: latestCoreState.gameplay.levelId,
            levelStatus: latestCoreState.gameplay.levelStatus,
            allTimeScore: latestCoreState.gameplay.allTimeScore,
            progress: {
              foundTargets: latestCoreState.gameplay.progress.foundTargets,
              totalTargets: latestCoreState.gameplay.progress.totalTargets,
            },
            isInputLocked: latestCoreState.gameplay.isInputLocked,
            showEphemeralCongrats: latestCoreState.gameplay.showEphemeralCongrats,
          },
          help: {
            freeActionAvailable: latestHelpState.freeActionAvailable,
            isLocked: latestHelpState.isLocked,
            cooldownMsRemaining: latestHelpState.cooldownMsRemaining,
            cooldownReason: latestHelpState.cooldownReason,
          },
          ui: {
            activePathLength: activePath.length,
            activeGlowAnimations: pathGlowAnimations.length,
            activeFlyingLetters: flyingLetterAnimations.length,
            toastMessage: toastMessage?.text ?? null,
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
