import type { ApplicationCommandBus, GridCellRef } from '../../application';
import { computeGameLayout } from '../../shared/game-layout';
import { MODULE_IDS } from '../../shared/module-ids';

const GRID_SIZE = 5;
const GRID_MIN_INDEX = 0;
const GRID_MAX_INDEX = GRID_SIZE - 1;

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

interface BoundsLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
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
        publishPathSnapshot();
      };

      pointerMoveHandler = (event) => {
        if (event.pointerId !== activePointerId) {
          return;
        }

        pathEngine.updateGesture(resolveCell(event));
        publishPathSnapshot();
      };

      pointerUpHandler = (event) => {
        if (event.pointerId !== activePointerId) {
          return;
        }

        pathEngine.updateGesture(resolveCell(event));
        const submittedPath = pathEngine.finishGesture();
        activePointerId = null;
        releaseCapture(event.pointerId);
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
