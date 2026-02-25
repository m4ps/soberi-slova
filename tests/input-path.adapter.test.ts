import { describe, expect, it } from 'vitest';

import type { ApplicationCommand, ApplicationCommandBus, CommandAck } from '../src/application';
import {
  createInputPathEngine,
  createInputPathModule,
  resolveGridCellFromPointer,
} from '../src/adapters/InputPath';

type PointerListener = (event: PointerEvent) => void;

class FakeCanvasElement {
  public readonly style: { touchAction: string } = { touchAction: '' };
  private readonly listeners = new Map<string, Set<PointerListener>>();
  private readonly capturedPointers = new Set<number>();

  public addEventListener(type: string, listener: PointerListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(listener);
  }

  public removeEventListener(type: string, listener: PointerListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public dispatchPointerEvent(type: string, event: Partial<PointerEvent> & { pointerId: number }) {
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }

    const pointerEvent = {
      pointerId: event.pointerId,
      clientX: event.clientX ?? 0,
      clientY: event.clientY ?? 0,
    } as PointerEvent;

    listeners.forEach((listener) => {
      listener(pointerEvent);
    });
  }

  public setPointerCapture(pointerId: number): void {
    this.capturedPointers.add(pointerId);
  }

  public releasePointerCapture(pointerId: number): void {
    this.capturedPointers.delete(pointerId);
  }

  public hasCapture(pointerId: number): boolean {
    return this.capturedPointers.has(pointerId);
  }

  public getBoundingClientRect(): DOMRect {
    return {
      left: 100,
      top: 50,
      width: 500,
      height: 500,
      right: 600,
      bottom: 550,
      x: 100,
      y: 50,
      toJSON: () => '',
    } as DOMRect;
  }
}

function createOkAck(commandType: ApplicationCommand['type']): { type: 'ok'; value: CommandAck } {
  return {
    type: 'ok',
    value: {
      commandType,
      handledAt: 0,
      correlationId: `${commandType}-corr`,
    },
  };
}

describe('InputPath adapter', () => {
  it('maps pointer coordinates to 5x5 grid cells and ignores out-of-bounds input', () => {
    const bounds = {
      left: 100,
      top: 50,
      width: 500,
      height: 500,
    };

    expect(resolveGridCellFromPointer({ clientX: 100, clientY: 50 }, bounds)).toEqual({
      row: 0,
      col: 0,
    });
    expect(resolveGridCellFromPointer({ clientX: 599, clientY: 549 }, bounds)).toEqual({
      row: 4,
      col: 4,
    });
    expect(resolveGridCellFromPointer({ clientX: 600, clientY: 550 }, bounds)).toBeNull();
    expect(resolveGridCellFromPointer({ clientX: 99, clientY: 60 }, bounds)).toBeNull();
  });

  it('enforces adjacency, one-cell tail undo and repeated-cell ignore in path engine', () => {
    const engine = createInputPathEngine();

    engine.startGesture({ row: 0, col: 0 });
    engine.updateGesture({ row: 0, col: 1 });
    engine.updateGesture({ row: 1, col: 1 });
    expect(engine.getPathSnapshot()).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);

    engine.updateGesture({ row: 0, col: 0 });
    expect(engine.getPathSnapshot()).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);

    engine.updateGesture({ row: 0, col: 1 });
    expect(engine.getPathSnapshot()).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);

    engine.updateGesture({ row: 0, col: 3 });
    expect(engine.getPathSnapshot()).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);

    expect(engine.finishGesture()).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(engine.getPathSnapshot()).toEqual([]);
  });

  it('submits swipe path only on pointerup and keeps tail undo behavior', () => {
    const dispatchedCommands: ApplicationCommand[] = [];
    const commandBus: ApplicationCommandBus = {
      dispatch: (command) => {
        dispatchedCommands.push(command);
        return createOkAck(command.type);
      },
    };
    const inputPathModule = createInputPathModule(commandBus);
    const canvas = new FakeCanvasElement();

    inputPathModule.bindToCanvas(canvas as unknown as HTMLCanvasElement);

    expect(canvas.style.touchAction).toBe('none');
    expect(dispatchedCommands).toHaveLength(0);

    canvas.dispatchPointerEvent('pointerdown', { pointerId: 1, clientX: 150, clientY: 100 });
    canvas.dispatchPointerEvent('pointermove', { pointerId: 1, clientX: 250, clientY: 100 });
    canvas.dispatchPointerEvent('pointermove', { pointerId: 1, clientX: 350, clientY: 100 });
    canvas.dispatchPointerEvent('pointermove', { pointerId: 1, clientX: 250, clientY: 100 });
    expect(dispatchedCommands).toHaveLength(0);

    canvas.dispatchPointerEvent('pointerup', { pointerId: 1, clientX: 250, clientY: 100 });
    expect(dispatchedCommands).toEqual([
      {
        type: 'SubmitPath',
        pathCells: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
        ],
      },
    ]);
    expect(canvas.hasCapture(1)).toBe(false);
  });

  it('ignores non-active pointers and does not submit on pointercancel', () => {
    const dispatchedCommands: ApplicationCommand[] = [];
    const commandBus: ApplicationCommandBus = {
      dispatch: (command) => {
        dispatchedCommands.push(command);
        return createOkAck(command.type);
      },
    };
    const inputPathModule = createInputPathModule(commandBus);
    const canvas = new FakeCanvasElement();

    inputPathModule.bindToCanvas(canvas as unknown as HTMLCanvasElement);

    canvas.dispatchPointerEvent('pointerdown', { pointerId: 10, clientX: 150, clientY: 100 });
    canvas.dispatchPointerEvent('pointerdown', { pointerId: 11, clientX: 250, clientY: 100 });
    canvas.dispatchPointerEvent('pointermove', { pointerId: 11, clientX: 350, clientY: 100 });
    canvas.dispatchPointerEvent('pointercancel', { pointerId: 10, clientX: 150, clientY: 100 });
    expect(dispatchedCommands).toHaveLength(0);

    canvas.dispatchPointerEvent('pointerup', { pointerId: 11, clientX: 350, clientY: 100 });
    expect(dispatchedCommands).toHaveLength(0);
  });

  it('removes listeners on dispose', () => {
    const dispatchedCommands: ApplicationCommand[] = [];
    const commandBus: ApplicationCommandBus = {
      dispatch: (command) => {
        dispatchedCommands.push(command);
        return createOkAck(command.type);
      },
    };
    const inputPathModule = createInputPathModule(commandBus);
    const canvas = new FakeCanvasElement();

    inputPathModule.bindToCanvas(canvas as unknown as HTMLCanvasElement);
    inputPathModule.dispose();

    canvas.dispatchPointerEvent('pointerdown', { pointerId: 1, clientX: 150, clientY: 100 });
    canvas.dispatchPointerEvent('pointermove', { pointerId: 1, clientX: 250, clientY: 100 });
    canvas.dispatchPointerEvent('pointerup', { pointerId: 1, clientX: 250, clientY: 100 });

    expect(dispatchedCommands).toHaveLength(0);
  });
});
