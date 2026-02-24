import { Application, Color, Graphics } from 'pixi.js';

import { GAME_VIEWPORT } from './config/viewport';
import './style.css';

function getRootElement(): HTMLDivElement {
  const rootElement = document.querySelector<HTMLDivElement>('#app');

  if (!rootElement) {
    throw new Error('Game root container #app is missing.');
  }

  return rootElement;
}

async function bootstrap(): Promise<void> {
  const rootElement = getRootElement();
  const app = new Application();

  await app.init({
    width: GAME_VIEWPORT.width,
    height: GAME_VIEWPORT.height,
    antialias: true,
    backgroundColor: new Color('#0f172a').toNumber(),
    preserveDrawingBuffer: true,
    resizeTo: rootElement,
  });

  app.canvas.style.touchAction = 'none';
  app.canvas.setAttribute('aria-label', 'Game canvas');
  rootElement.appendChild(app.canvas);

  const backdrop = new Graphics()
    .rect(0, 0, GAME_VIEWPORT.width, GAME_VIEWPORT.height)
    .fill({ color: 0x0f172a });
  app.stage.addChild(backdrop);
  app.render();

  window.advanceTime = async (ms: number) => {
    const frameDuration = 1000 / 60;
    const frames = Math.max(1, Math.round(ms / frameDuration));

    for (let frame = 0; frame < frames; frame += 1) {
      app.render();
    }
  };

  window.render_game_to_text = () => {
    return JSON.stringify({
      mode: 'bootstrap-empty-screen',
      coordinateSystem: {
        origin: 'top-left',
        xAxis: 'right',
        yAxis: 'down',
      },
      viewport: {
        width: Math.round(app.screen.width),
        height: Math.round(app.screen.height),
        isPortrait: app.screen.height >= app.screen.width,
      },
      stageChildren: app.stage.children.length,
    });
  };
}

void bootstrap();
