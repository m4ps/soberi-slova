import { createApplicationLayer } from './application';
import { createInputPathModule } from './adapters/InputPath';
import { createPersistenceModule } from './adapters/Persistence';
import { createPlatformYandexModule } from './adapters/PlatformYandex';
import { createRenderMotionModule } from './adapters/RenderMotion';
import { createTelemetryModule } from './adapters/Telemetry';
import { createCoreStateModule } from './domain/CoreState';
import { createHelpEconomyModule } from './domain/HelpEconomy';
import { createLevelGeneratorModule } from './domain/LevelGenerator';
import { createWordValidationModule } from './domain/WordValidation';
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

  const application = createApplicationLayer({
    coreState: createCoreStateModule(),
    wordValidation: createWordValidationModule(),
    levelGenerator: createLevelGeneratorModule(),
    helpEconomy: createHelpEconomyModule(),
  });

  const renderMotionModule = createRenderMotionModule(application.readModel);
  const renderMotionRuntime = await renderMotionModule.mount(rootElement);

  const inputPathModule = createInputPathModule(application.commands);
  inputPathModule.bindToCanvas(renderMotionRuntime.canvas);

  const telemetryModule = createTelemetryModule(application.events);
  telemetryModule.start();

  const persistenceModule = createPersistenceModule(
    application.commands,
    application.queries,
  );
  await persistenceModule.restore();

  const platformYandexModule = createPlatformYandexModule(
    application.commands,
    application.events,
  );
  await platformYandexModule.bootstrap();

  window.advanceTime = async (ms: number) => {
    const frameDuration = 1000 / 60;
    const frames = Math.max(1, Math.round(ms / frameDuration));

    for (let frame = 0; frame < frames; frame += 1) {
      renderMotionRuntime.stepFrame();
    }

    application.commands.dispatch({ type: 'Tick', nowTs: Date.now() });
  };

  window.render_game_to_text = () => {
    const sceneSnapshot = renderMotionRuntime.toTextSnapshot();

    return JSON.stringify({
      mode: sceneSnapshot.runtimeMode,
      coordinateSystem: {
        origin: 'top-left',
        xAxis: 'right',
        yAxis: 'down',
      },
      viewport: sceneSnapshot.viewport,
      stageChildren: sceneSnapshot.stageChildren,
      telemetryBufferSize: telemetryModule.getBufferedEvents().length,
      persistence: persistenceModule.getLastSnapshot(),
    });
  };
}

void bootstrap();
