import type { ApplicationCommandBus, GridCellRef } from '../../application';
import { computeGameLayout } from '../../shared/game-layout';
import { MODULE_IDS } from '../../shared/module-ids';

const GRID_SIZE = 5;
const GRID_MIN_INDEX = 0;
const GRID_MAX_INDEX = GRID_SIZE - 1;
const SNAP_ACTIVATION_DISTANCE_CELLS = 0.38;
const SNAP_AXIS_COMPONENT_THRESHOLD_CELLS = 0.22;
const SNAP_DIAGONAL_RATIO_THRESHOLD = 0.46;
const SNAP_DIAGONAL_RATIO_HYSTERESIS = 0.34;
const SNAP_AXIS_HYSTERESIS_FACTOR = 1.18;
const INTERPOLATION_STEP_IN_CELLS = 0.35;

export interface InputPathModule {
  readonly moduleName: typeof MODULE_IDS.inputPath;
  bindToCanvas: (canvas: HTMLCanvasElement) => void;
  dispose: () => void;
}

export interface InputPathModuleOptions {
  readonly onPathChanged?: (path: readonly GridCellRef[]) => void;
}

interface PointerPoint {
  readonly clientX: number;
  readonly clientY: number;
}

type GridStep = -1 | 0 | 1;

interface DirectionStep {
  readonly rowDelta: GridStep;
  readonly colDelta: GridStep;
}

interface PointerDelta {
  readonly deltaX: number;
  readonly deltaY: number;
}

interface BoundsLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface SnapDirection extends DirectionStep {
  readonly kind: 'axis' | 'diagonal';
}

export interface InputPathEngine {
  startGesture: (cell: GridCellRef | null) => void;
  updateGesture: (cell: GridCellRef | null) => void;
  finishGesture: () => readonly GridCellRef[] | null;
  cancelGesture: () => void;
  getPathSnapshot: () => readonly GridCellRef[];
}

function isSameCell(left: GridCellRef, right: GridCellRef): boolean {
  return left.row === right.row && left.col === right.col;
}

function isAdjacentCell(left: GridCellRef, right: GridCellRef): boolean {
  const rowDelta = Math.abs(left.row - right.row);
  const colDelta = Math.abs(left.col - right.col);

  if (rowDelta === 0 && colDelta === 0) {
    return false;
  }

  return rowDelta <= 1 && colDelta <= 1;
}

function clonePath(path: readonly GridCellRef[]): readonly GridCellRef[] {
  return path.map((cell) => ({ ...cell }));
}

function toGridStep(value: number): GridStep {
  if (value > 0) {
    return 1;
  }

  if (value < 0) {
    return -1;
  }

  return 0;
}

function resolveDirectionBetweenCells(fromCell: GridCellRef, toCell: GridCellRef): DirectionStep {
  return {
    rowDelta: toGridStep(toCell.row - fromCell.row),
    colDelta: toGridStep(toCell.col - fromCell.col),
  };
}

function isCellInsideGrid(cell: GridCellRef): boolean {
  return (
    cell.row >= GRID_MIN_INDEX &&
    cell.row <= GRID_MAX_INDEX &&
    cell.col >= GRID_MIN_INDEX &&
    cell.col <= GRID_MAX_INDEX
  );
}

function isDirectionAlignedWithPointerMovement(
  direction: DirectionStep,
  movement: PointerDelta,
): boolean {
  const movementCol = toGridStep(movement.deltaX);
  const movementRow = toGridStep(movement.deltaY);

  if (movementCol !== 0 && direction.colDelta !== 0 && movementCol !== direction.colDelta) {
    return false;
  }

  if (movementRow !== 0 && direction.rowDelta !== 0 && movementRow !== direction.rowDelta) {
    return false;
  }

  return true;
}

function hasPathChanged(
  previousPath: readonly GridCellRef[],
  nextPath: readonly GridCellRef[],
): boolean {
  if (previousPath.length !== nextPath.length) {
    return true;
  }

  const previousLastCell = previousPath.at(-1);
  const nextLastCell = nextPath.at(-1);

  if (!previousLastCell || !nextLastCell) {
    return false;
  }

  return !isSameCell(previousLastCell, nextLastCell);
}

function resolveGridCellCenter(cell: GridCellRef, bounds: BoundsLike): PointerPoint {
  const cellWidth = bounds.width / GRID_SIZE;
  const cellHeight = bounds.height / GRID_SIZE;

  return {
    clientX: bounds.left + (cell.col + 0.5) * cellWidth,
    clientY: bounds.top + (cell.row + 0.5) * cellHeight,
  };
}

function resolveSnapDirection(
  vectorXInCells: number,
  vectorYInCells: number,
  previousDirection: SnapDirection | null,
): SnapDirection | null {
  const distanceInCells = Math.hypot(vectorXInCells, vectorYInCells);
  if (distanceInCells < SNAP_ACTIVATION_DISTANCE_CELLS) {
    return null;
  }

  const absX = Math.abs(vectorXInCells);
  const absY = Math.abs(vectorYInCells);
  const colDelta = toGridStep(vectorXInCells);
  const rowDelta = toGridStep(vectorYInCells);

  if (colDelta === 0 && rowDelta === 0) {
    return null;
  }

  const dominant = Math.max(absX, absY);
  const minor = Math.min(absX, absY);
  const diagonalRatio = dominant === 0 ? 0 : minor / dominant;
  const diagonalThreshold =
    previousDirection?.kind === 'diagonal'
      ? SNAP_DIAGONAL_RATIO_HYSTERESIS
      : SNAP_DIAGONAL_RATIO_THRESHOLD;

  if (
    rowDelta !== 0 &&
    colDelta !== 0 &&
    absX >= SNAP_AXIS_COMPONENT_THRESHOLD_CELLS &&
    absY >= SNAP_AXIS_COMPONENT_THRESHOLD_CELLS &&
    diagonalRatio >= diagonalThreshold
  ) {
    return {
      rowDelta,
      colDelta,
      kind: 'diagonal',
    };
  }

  if (previousDirection?.kind === 'axis') {
    if (
      previousDirection.colDelta !== 0 &&
      absX >= SNAP_AXIS_COMPONENT_THRESHOLD_CELLS &&
      absX >= absY * SNAP_AXIS_HYSTERESIS_FACTOR
    ) {
      return {
        rowDelta: 0,
        colDelta: colDelta === 0 ? previousDirection.colDelta : colDelta,
        kind: 'axis',
      };
    }

    if (
      previousDirection.rowDelta !== 0 &&
      absY >= SNAP_AXIS_COMPONENT_THRESHOLD_CELLS &&
      absY >= absX * SNAP_AXIS_HYSTERESIS_FACTOR
    ) {
      return {
        rowDelta: rowDelta === 0 ? previousDirection.rowDelta : rowDelta,
        colDelta: 0,
        kind: 'axis',
      };
    }
  }

  if (absX >= absY && absX >= SNAP_AXIS_COMPONENT_THRESHOLD_CELLS && colDelta !== 0) {
    return {
      rowDelta: 0,
      colDelta,
      kind: 'axis',
    };
  }

  if (absY >= SNAP_AXIS_COMPONENT_THRESHOLD_CELLS && rowDelta !== 0) {
    return {
      rowDelta,
      colDelta: 0,
      kind: 'axis',
    };
  }

  return null;
}

function resolveSnappedAdjacentCell(
  lastCell: GridCellRef,
  pointerPoint: PointerPoint,
  bounds: BoundsLike,
  previousDirection: SnapDirection | null,
): { readonly cell: GridCellRef; readonly direction: SnapDirection } | null {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const center = resolveGridCellCenter(lastCell, bounds);
  const cellWidth = bounds.width / GRID_SIZE;
  const cellHeight = bounds.height / GRID_SIZE;
  const vectorXInCells = (pointerPoint.clientX - center.clientX) / cellWidth;
  const vectorYInCells = (pointerPoint.clientY - center.clientY) / cellHeight;
  const direction = resolveSnapDirection(vectorXInCells, vectorYInCells, previousDirection);

  if (!direction) {
    return null;
  }

  const candidateCell = {
    row: lastCell.row + direction.rowDelta,
    col: lastCell.col + direction.colDelta,
  };

  if (!isCellInsideGrid(candidateCell)) {
    return null;
  }

  return {
    cell: candidateCell,
    direction,
  };
}

function createInterpolatedPointerSamples(
  fromPoint: PointerPoint,
  toPoint: PointerPoint,
  bounds: BoundsLike,
): readonly PointerPoint[] {
  const deltaX = toPoint.clientX - fromPoint.clientX;
  const deltaY = toPoint.clientY - fromPoint.clientY;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance === 0) {
    return [];
  }

  const cellSize = Math.min(bounds.width, bounds.height) / GRID_SIZE;
  const interpolationStep = Math.max(1, cellSize * INTERPOLATION_STEP_IN_CELLS);
  const interpolationSteps = Math.max(1, Math.ceil(distance / interpolationStep));
  const samples: PointerPoint[] = [];

  for (let stepIndex = 1; stepIndex <= interpolationSteps; stepIndex += 1) {
    const ratio = stepIndex / interpolationSteps;
    samples.push({
      clientX: fromPoint.clientX + deltaX * ratio,
      clientY: fromPoint.clientY + deltaY * ratio,
    });
  }

  return samples;
}

export function createInputPathEngine(): InputPathEngine {
  const path: GridCellRef[] = [];
  let isGestureActive = false;

  return {
    startGesture: (cell) => {
      isGestureActive = true;
      path.length = 0;

      if (cell) {
        path.push({ ...cell });
      }
    },
    updateGesture: (cell) => {
      if (!isGestureActive || !cell) {
        return;
      }

      const lastCell = path.at(-1);
      if (!lastCell) {
        path.push({ ...cell });
        return;
      }

      if (isSameCell(lastCell, cell)) {
        return;
      }

      const previousCell = path.length > 1 ? path[path.length - 2] : null;
      if (previousCell && isSameCell(previousCell, cell)) {
        path.pop();
        return;
      }

      const cellAlreadyUsed = path.some((existingCell) => isSameCell(existingCell, cell));
      if (cellAlreadyUsed || !isAdjacentCell(lastCell, cell)) {
        return;
      }

      path.push({ ...cell });
    },
    finishGesture: () => {
      if (!isGestureActive) {
        return null;
      }

      isGestureActive = false;

      if (path.length === 0) {
        return null;
      }

      const submittedPath = clonePath(path);
      path.length = 0;
      return submittedPath;
    },
    cancelGesture: () => {
      isGestureActive = false;
      path.length = 0;
    },
    getPathSnapshot: () => {
      return clonePath(path);
    },
  };
}

export function resolveGridCellFromPointer(
  pointerPoint: PointerPoint,
  bounds: BoundsLike,
): GridCellRef | null {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const relativeX = pointerPoint.clientX - bounds.left;
  const relativeY = pointerPoint.clientY - bounds.top;

  if (relativeX < 0 || relativeY < 0 || relativeX >= bounds.width || relativeY >= bounds.height) {
    return null;
  }

  const cellWidth = bounds.width / GRID_SIZE;
  const cellHeight = bounds.height / GRID_SIZE;
  const row = Math.floor(relativeY / cellHeight);
  const col = Math.floor(relativeX / cellWidth);

  if (
    row < GRID_MIN_INDEX ||
    row > GRID_MAX_INDEX ||
    col < GRID_MIN_INDEX ||
    col > GRID_MAX_INDEX
  ) {
    return null;
  }

  return { row, col };
}

function resolveGridBoundsFromCanvas(canvas: HTMLCanvasElement): BoundsLike {
  const canvasBounds = canvas.getBoundingClientRect();
  const layout = computeGameLayout(canvasBounds.width, canvasBounds.height);

  return {
    left: canvasBounds.left + layout.grid.x,
    top: canvasBounds.top + layout.grid.y,
    width: layout.grid.width,
    height: layout.grid.height,
  };
}

export function createInputPathModule(
  commandBus: ApplicationCommandBus,
  options: InputPathModuleOptions = {},
): InputPathModule {
  let boundCanvas: HTMLCanvasElement | null = null;
  let activePointerId: number | null = null;
  let lastPointerPoint: PointerPoint | null = null;
  let lastSnappedDirection: SnapDirection | null = null;
  const pathEngine = createInputPathEngine();
  let pointerDownHandler: ((event: PointerEvent) => void) | null = null;
  let pointerMoveHandler: ((event: PointerEvent) => void) | null = null;
  let pointerUpHandler: ((event: PointerEvent) => void) | null = null;
  let pointerCancelHandler: ((event: PointerEvent) => void) | null = null;

  const resolveCell = (event: PointerEvent): GridCellRef | null => {
    if (!boundCanvas) {
      return null;
    }

    return resolveGridCellFromPointer(event, resolveGridBoundsFromCanvas(boundCanvas));
  };

  const releaseCapture = (pointerId: number): void => {
    if (!boundCanvas) {
      return;
    }

    boundCanvas.releasePointerCapture?.(pointerId);
  };

  const publishPathSnapshot = (): void => {
    options.onPathChanged?.(pathEngine.getPathSnapshot());
  };

  const resetPointerTracking = (): void => {
    lastPointerPoint = null;
    lastSnappedDirection = null;
  };

  const pushPointToPath = (
    point: PointerPoint,
    bounds: BoundsLike,
    movement: PointerDelta,
  ): void => {
    const fallbackCell = resolveGridCellFromPointer(point, bounds);
    if (!fallbackCell) {
      return;
    }
    const pathBefore = pathEngine.getPathSnapshot();
    const lastCell = pathBefore.at(-1);

    if (!lastCell) {
      pathEngine.updateGesture(fallbackCell);
      lastSnappedDirection = null;
      return;
    }

    if (isSameCell(lastCell, fallbackCell)) {
      return;
    }

    const fallbackDirection = resolveDirectionBetweenCells(lastCell, fallbackCell);
    const fallbackIsAligned = isDirectionAlignedWithPointerMovement(fallbackDirection, movement);

    const snappedCandidate = resolveSnappedAdjacentCell(
      lastCell,
      point,
      bounds,
      lastSnappedDirection,
    );

    if (!snappedCandidate) {
      if (fallbackIsAligned) {
        pathEngine.updateGesture(fallbackCell);
      }
      lastSnappedDirection = null;
      return;
    }

    if (!isDirectionAlignedWithPointerMovement(snappedCandidate.direction, movement)) {
      if (fallbackIsAligned) {
        pathEngine.updateGesture(fallbackCell);
      }
      lastSnappedDirection = null;
      return;
    }

    pathEngine.updateGesture(snappedCandidate.cell);
    const pathAfter = pathEngine.getPathSnapshot();

    if (!hasPathChanged(pathBefore, pathAfter)) {
      if (fallbackIsAligned && !isSameCell(snappedCandidate.cell, fallbackCell)) {
        pathEngine.updateGesture(fallbackCell);
      }
      lastSnappedDirection = null;
      return;
    }

    lastSnappedDirection = snappedCandidate.direction;
  };

  const updateGestureFromPointerPoint = (point: PointerPoint): void => {
    if (!boundCanvas) {
      return;
    }

    const bounds = resolveGridBoundsFromCanvas(boundCanvas);
    const sampleStart = lastPointerPoint ?? point;
    const samples = createInterpolatedPointerSamples(sampleStart, point, bounds);
    let previousSample = sampleStart;
    samples.forEach((sample) => {
      pushPointToPath(sample, bounds, {
        deltaX: sample.clientX - previousSample.clientX,
        deltaY: sample.clientY - previousSample.clientY,
      });
      previousSample = sample;
    });
    lastPointerPoint = { ...point };
  };

  return {
    moduleName: MODULE_IDS.inputPath,
    bindToCanvas: (canvas) => {
      if (
        boundCanvas &&
        pointerDownHandler &&
        pointerMoveHandler &&
        pointerUpHandler &&
        pointerCancelHandler
      ) {
        boundCanvas.removeEventListener('pointerdown', pointerDownHandler);
        boundCanvas.removeEventListener('pointermove', pointerMoveHandler);
        boundCanvas.removeEventListener('pointerup', pointerUpHandler);
        boundCanvas.removeEventListener('pointercancel', pointerCancelHandler);
      }
      options.onPathChanged?.([]);

      pointerDownHandler = (event) => {
        if (activePointerId !== null) {
          return;
        }

        activePointerId = event.pointerId;
        boundCanvas = canvas;
        boundCanvas.setPointerCapture?.(event.pointerId);
        pathEngine.startGesture(resolveCell(event));
        resetPointerTracking();
        lastPointerPoint = {
          clientX: event.clientX,
          clientY: event.clientY,
        };
        publishPathSnapshot();
      };

      pointerMoveHandler = (event) => {
        if (event.pointerId !== activePointerId) {
          return;
        }

        updateGestureFromPointerPoint({
          clientX: event.clientX,
          clientY: event.clientY,
        });
        publishPathSnapshot();
      };

      pointerUpHandler = (event) => {
        if (event.pointerId !== activePointerId) {
          return;
        }

        updateGestureFromPointerPoint({
          clientX: event.clientX,
          clientY: event.clientY,
        });
        const submittedPath = pathEngine.finishGesture();
        activePointerId = null;
        releaseCapture(event.pointerId);
        resetPointerTracking();
        publishPathSnapshot();

        if (submittedPath && submittedPath.length > 0) {
          commandBus.dispatch({
            type: 'SubmitPath',
            pathCells: submittedPath,
          });
        }
      };

      pointerCancelHandler = (event) => {
        if (event.pointerId !== activePointerId) {
          return;
        }

        pathEngine.cancelGesture();
        activePointerId = null;
        releaseCapture(event.pointerId);
        resetPointerTracking();
        publishPathSnapshot();
      };

      boundCanvas = canvas;
      boundCanvas.style.touchAction = 'none';
      boundCanvas.addEventListener('pointerdown', pointerDownHandler);
      boundCanvas.addEventListener('pointermove', pointerMoveHandler);
      boundCanvas.addEventListener('pointerup', pointerUpHandler);
      boundCanvas.addEventListener('pointercancel', pointerCancelHandler);
    },
    dispose: () => {
      if (
        boundCanvas &&
        pointerDownHandler &&
        pointerMoveHandler &&
        pointerUpHandler &&
        pointerCancelHandler
      ) {
        if (activePointerId !== null) {
          releaseCapture(activePointerId);
        }

        pathEngine.cancelGesture();
        resetPointerTracking();
        options.onPathChanged?.([]);
        activePointerId = null;
        boundCanvas.removeEventListener('pointerdown', pointerDownHandler);
        boundCanvas.removeEventListener('pointermove', pointerMoveHandler);
        boundCanvas.removeEventListener('pointerup', pointerUpHandler);
        boundCanvas.removeEventListener('pointercancel', pointerCancelHandler);
      }

      boundCanvas = null;
      pointerDownHandler = null;
      pointerMoveHandler = null;
      pointerUpHandler = null;
      pointerCancelHandler = null;
    },
  };
}
