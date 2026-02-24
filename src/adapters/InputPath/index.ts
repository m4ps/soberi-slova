import type { ApplicationCommandBus } from '../../application';

export interface InputPathModule {
  readonly moduleName: 'InputPath';
  bindToCanvas: (canvas: HTMLCanvasElement) => void;
  dispose: () => void;
}

export function createInputPathModule(
  commandBus: ApplicationCommandBus,
): InputPathModule {
  let boundCanvas: HTMLCanvasElement | null = null;
  let pointerUpHandler: ((event: PointerEvent) => void) | null = null;

  return {
    moduleName: 'InputPath',
    bindToCanvas: (canvas) => {
      if (boundCanvas && pointerUpHandler) {
        boundCanvas.removeEventListener('pointerup', pointerUpHandler);
      }

      pointerUpHandler = () => {
        commandBus.dispatch({ type: 'Tick', nowTs: Date.now() });
      };

      boundCanvas = canvas;
      boundCanvas.style.touchAction = 'none';
      boundCanvas.addEventListener('pointerup', pointerUpHandler);
    },
    dispose: () => {
      if (boundCanvas && pointerUpHandler) {
        boundCanvas.removeEventListener('pointerup', pointerUpHandler);
      }

      boundCanvas = null;
      pointerUpHandler = null;
    },
  };
}
