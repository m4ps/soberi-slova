import { Application, Color, Graphics } from 'pixi.js';

import type { ApplicationReadModel } from '../../application';
import { GAME_VIEWPORT } from '../../config/viewport';

export interface RenderMotionSnapshot {
  readonly runtimeMode: string;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
    readonly isPortrait: boolean;
  };
  readonly stageChildren: number;
}

export interface RenderMotionRuntime {
  readonly moduleName: 'RenderMotion';
  readonly canvas: HTMLCanvasElement;
  stepFrame: () => void;
  toTextSnapshot: () => RenderMotionSnapshot;
  dispose: () => Promise<void>;
}

export interface RenderMotionModule {
  readonly moduleName: 'RenderMotion';
  mount: (rootElement: HTMLDivElement) => Promise<RenderMotionRuntime>;
}

export function createRenderMotionModule(
  readModel: ApplicationReadModel,
): RenderMotionModule {
  return {
    moduleName: 'RenderMotion',
    mount: async (rootElement) => {
      const app = new Application();

      await app.init({
        width: GAME_VIEWPORT.width,
        height: GAME_VIEWPORT.height,
        antialias: true,
        backgroundColor: new Color('#0f172a').toNumber(),
        preserveDrawingBuffer: true,
        resizeTo: rootElement,
      });

      app.canvas.setAttribute('aria-label', 'Game canvas');
      rootElement.appendChild(app.canvas);

      const backdrop = new Graphics()
        .rect(0, 0, GAME_VIEWPORT.width, GAME_VIEWPORT.height)
        .fill({ color: 0x0f172a });
      app.stage.addChild(backdrop);
      app.render();

      return {
        moduleName: 'RenderMotion',
        canvas: app.canvas,
        stepFrame: () => {
          app.render();
        },
        toTextSnapshot: () => ({
          runtimeMode: readModel.getCoreState().runtimeMode,
          viewport: {
            width: Math.round(app.screen.width),
            height: Math.round(app.screen.height),
            isPortrait: app.screen.height >= app.screen.width,
          },
          stageChildren: app.stage.children.length,
        }),
        dispose: async () => {
          app.destroy(true);
        },
      };
    },
  };
}
