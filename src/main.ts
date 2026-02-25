import { createApplicationLayer } from './application';
import { createInputPathModule } from './adapters/InputPath';
import { createPersistenceModule } from './adapters/Persistence';
import { createPlatformYandexModule } from './adapters/PlatformYandex';
import { createRenderMotionModule, type RenderMotionRuntime } from './adapters/RenderMotion';
import { createTelemetryModule } from './adapters/Telemetry';
import { createCoreStateModule } from './domain/CoreState';
import { createHelpEconomyModule } from './domain/HelpEconomy';
import { toErrorMessage } from './shared/errors';
import './style.css';

function getRootElement(): HTMLDivElement {
  const rootElement = document.querySelector<HTMLDivElement>('#app');

  if (!rootElement) {
    throw new Error('Game root container #app is missing.');
  }

  return rootElement;
}

function renderBootstrapFailState(rootElement: HTMLDivElement, reason: string): void {
  rootElement.replaceChildren();

  const container = document.createElement('section');
  container.setAttribute('aria-live', 'polite');
  container.style.display = 'grid';
  container.style.gap = '8px';
  container.style.placeContent = 'center';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.padding = '20px';
  container.style.textAlign = 'center';
  container.style.background = '#0f172a';
  container.style.color = '#e2e8f0';
  container.style.fontFamily =
    '"Manrope", "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", sans-serif';

  const title = document.createElement('h1');
  title.textContent = 'Runtime unavailable';
  title.style.margin = '0';
  title.style.fontSize = '20px';
  title.style.fontWeight = '700';

  const description = document.createElement('p');
  description.textContent =
    'Yandex SDK initialization failed. Launch through sdk-dev-proxy or Yandex draft runtime.';
  description.style.margin = '0';
  description.style.fontSize = '14px';
  description.style.lineHeight = '1.4';

  const details = document.createElement('p');
  details.textContent = `Reason: ${reason}`;
  details.style.margin = '0';
  details.style.fontSize = '12px';
  details.style.lineHeight = '1.4';
  details.style.opacity = '0.8';

  container.append(title, description, details);
  rootElement.append(container);
}

function installFailureHooks(reason: string): void {
  window.advanceTime = () => undefined;
  window.render_game_to_text = () => {
    return JSON.stringify({
      mode: 'bootstrap-failed',
      coordinateSystem: {
        origin: 'top-left',
        xAxis: 'right',
        yAxis: 'down',
      },
      reason,
    });
  };
}

async function cleanupBootstrapRuntime(
  renderMotionRuntime: RenderMotionRuntime | null,
  inputPathDispose: () => void,
  telemetryStop: () => void,
  platformDispose: () => void,
): Promise<void> {
  inputPathDispose();
  telemetryStop();
  platformDispose();

  if (renderMotionRuntime) {
    await renderMotionRuntime.dispose();
  }
}

async function bootstrap(): Promise<void> {
  const rootElement = getRootElement();
  const coreStateModule = createCoreStateModule();
  const initialHelpWindow = coreStateModule.getSnapshot().gameState.helpWindow;
  const helpEconomyModule = createHelpEconomyModule({
    windowStartTs: initialHelpWindow.windowStartTs,
    freeActionAvailable: initialHelpWindow.freeActionAvailable,
  });

  const application = createApplicationLayer({
    coreState: coreStateModule,
    helpEconomy: helpEconomyModule,
  });

  const renderMotionModule = createRenderMotionModule(
    application.readModel,
    application.commands,
    application.events,
  );
  let renderMotionRuntime: RenderMotionRuntime | null = null;
  const inputPathModule = createInputPathModule(application.commands, {
    onPathChanged: (path) => {
      renderMotionRuntime?.setInputPath(path);
    },
  });
  const telemetryModule = createTelemetryModule(application.events);
  const persistenceModule = createPersistenceModule(application.commands, application.queries);
  const platformYandexModule = createPlatformYandexModule(application.commands, application.events);

  try {
    renderMotionRuntime = await renderMotionModule.mount(rootElement);
    const mountedRuntime = renderMotionRuntime;

    telemetryModule.start();
    await persistenceModule.restore();
    await platformYandexModule.bootstrap();
    inputPathModule.bindToCanvas(mountedRuntime.canvas);

    window.advanceTime = async (ms: number) => {
      const frameDuration = 1000 / 60;
      const frames = Math.max(1, Math.round(ms / frameDuration));

      for (let frame = 0; frame < frames; frame += 1) {
        mountedRuntime.stepFrame();
      }

      application.commands.dispatch({ type: 'Tick', nowTs: Date.now() });
    };

    window.render_game_to_text = () => {
      const sceneSnapshot = mountedRuntime.toTextSnapshot();

      return JSON.stringify({
        mode: sceneSnapshot.runtimeMode,
        coordinateSystem: {
          origin: 'top-left',
          xAxis: 'right',
          yAxis: 'down',
        },
        viewport: sceneSnapshot.viewport,
        stageChildren: sceneSnapshot.stageChildren,
        gameplay: sceneSnapshot.gameplay,
        help: sceneSnapshot.help,
        ui: sceneSnapshot.ui,
        telemetryBufferSize: telemetryModule.getBufferedEvents().length,
        persistence: persistenceModule.getLastSnapshot(),
        platformLifecycle: platformYandexModule.getLifecycleLog(),
      });
    };
  } catch (error: unknown) {
    const reason = toErrorMessage(error);

    await cleanupBootstrapRuntime(
      renderMotionRuntime,
      () => inputPathModule.dispose(),
      () => telemetryModule.stop(),
      () => platformYandexModule.dispose(),
    ).catch((cleanupError: unknown) => {
      console.error('[main] Cleanup after bootstrap failure failed.', cleanupError);
    });

    renderBootstrapFailState(rootElement, reason);
    installFailureHooks(reason);

    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  console.error('[main] Bootstrap failed.', error);
});
