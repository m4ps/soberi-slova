import { createApplicationLayer } from './application';
import { createInputPathModule } from './adapters/InputPath';
import { createPersistenceModule } from './adapters/Persistence';
import { createPlatformYandexModule } from './adapters/PlatformYandex';
import { createRenderMotionModule, type RenderMotionRuntime } from './adapters/RenderMotion';
import { createTelemetryModule } from './adapters/Telemetry';
import { createVisualSystemModule, type VisualTokens } from './adapters/VisualSystem';
import { createCoreStateModule, type CoreStateModuleOptions } from './domain/CoreState';
import { createHelpEconomyModule } from './domain/HelpEconomy';
import { createLevelGeneratorModule } from './domain/LevelGenerator';
import {
  createRuntimeDictionaryResources,
  createWordValidationModule,
} from './domain/WordValidation';
import { toErrorMessage } from './shared/errors';
import dictionaryCsv from '../data/dictionary.csv?raw';
import './style.css';

const DIAGNOSTIC_HOOKS_ENABLED = import.meta.env.DEV;

function createCoreStateDictionaryDependencies(): Pick<
  CoreStateModuleOptions,
  'wordValidation' | 'levelGenerator'
> {
  const resources = createRuntimeDictionaryResources(dictionaryCsv);

  return {
    wordValidation: createWordValidationModule(resources.bonusLookupWords),
    levelGenerator: createLevelGeneratorModule({
      dictionaryEntries: resources.levelGeneratorEntries,
    }),
  };
}

function getRootElement(): HTMLDivElement {
  const rootElement = document.querySelector<HTMLDivElement>('#app');

  if (!rootElement) {
    throw new Error('Game root container #app is missing.');
  }

  return rootElement;
}

function applyRuntimeShellVisualTokens(visualTokens: VisualTokens): void {
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty('--visual-app-background', visualTokens.shell.appBackgroundHex);
  rootStyle.setProperty('--visual-app-background-end', visualTokens.shell.appBackgroundEndHex);
  rootStyle.setProperty('--visual-app-cloud-cool', visualTokens.shell.appCloudCoolHex);
  rootStyle.setProperty('--visual-app-cloud-mint', visualTokens.shell.appCloudMintHex);
  rootStyle.setProperty('--visual-app-cloud-warm', visualTokens.shell.appCloudWarmHex);
  rootStyle.setProperty('--visual-app-ambient-bloom', visualTokens.shell.appAmbientBloomHex);
  rootStyle.setProperty('--visual-shell-fill', visualTokens.shell.shellFillCss);
  rootStyle.setProperty('--visual-shell-stroke', visualTokens.shell.shellStrokeHex);
  rootStyle.setProperty('--visual-shell-shadow', visualTokens.shell.shellShadowCss);
  rootStyle.setProperty(
    '--visual-shell-shadow-elevated',
    visualTokens.shell.shellElevatedShadowCss,
  );
  rootStyle.setProperty('--visual-shell-blur', `${visualTokens.shell.shellBackdropBlurPx}px`);
  rootStyle.setProperty('--visual-shell-radius', `${visualTokens.shell.shellBorderRadiusPx}px`);
  rootStyle.setProperty('--visual-shell-stroke-width', `${visualTokens.stroke.shellWidth}px`);
  rootStyle.setProperty('--visual-font-family', visualTokens.typography.fontFamily);
}

function renderBootstrapFailState(
  rootElement: HTMLDivElement,
  reason: string,
  visualTokens: VisualTokens,
): void {
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
  container.style.background = visualTokens.shell.shellFillCss;
  container.style.border = `${visualTokens.stroke.shellWidth}px solid ${visualTokens.panels.currentWord.strokeHex}`;
  container.style.borderRadius = `${visualTokens.shell.shellBorderRadiusPx - 4}px`;
  container.style.color = visualTokens.text.primaryHex;
  container.style.fontFamily = visualTokens.typography.fontFamily;
  container.style.boxShadow = `0 16px 42px ${visualTokens.shell.shellShadowCss}, 0 28px 56px ${visualTokens.shell.shellElevatedShadowCss}`;
  container.style.backdropFilter = `blur(${visualTokens.shell.shellBackdropBlurPx}px)`;

  const title = document.createElement('h1');
  title.textContent = 'Runtime unavailable';
  title.style.margin = '0';
  title.style.fontSize = '20px';
  title.style.fontWeight = String(visualTokens.typography.valueWeight);

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

function clearDiagnosticHooks(): void {
  delete window.advanceTime;
  delete window.render_game_to_text;
}

function installFailureHooks(reason: string): void {
  if (!DIAGNOSTIC_HOOKS_ENABLED) {
    clearDiagnosticHooks();
    return;
  }

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
  persistenceDispose: () => void,
  platformDispose: () => void,
): Promise<void> {
  inputPathDispose();
  telemetryStop();
  persistenceDispose();
  platformDispose();

  if (renderMotionRuntime) {
    await renderMotionRuntime.dispose();
  }
}

async function bootstrap(): Promise<void> {
  const rootElement = getRootElement();
  clearDiagnosticHooks();

  const visualSystemModule = createVisualSystemModule();
  applyRuntimeShellVisualTokens(visualSystemModule.tokens);

  const coreStateModule = createCoreStateModule(createCoreStateDictionaryDependencies());
  const helpEconomyModule = createHelpEconomyModule();

  const application = createApplicationLayer({
    coreState: coreStateModule,
    helpEconomy: helpEconomyModule,
  });

  const renderMotionModule = createRenderMotionModule(
    application.readModel,
    application.commands,
    application.events,
    visualSystemModule,
  );
  let renderMotionRuntime: RenderMotionRuntime | null = null;
  const inputPathModule = createInputPathModule(application.commands, {
    onPathChanged: (path) => {
      renderMotionRuntime?.setInputPath(path);
    },
    visualSystem: visualSystemModule,
  });
  const telemetryModule = createTelemetryModule(application.events, {
    getCurrentCoreState: application.readModel.getCoreState,
  });
  const platformYandexModule = createPlatformYandexModule(application.commands, application.events);
  const persistenceModule = createPersistenceModule(application.commands, application.queries, {
    platform: platformYandexModule,
    eventBus: application.events,
  });

  try {
    telemetryModule.start();
    await platformYandexModule.bootstrap();
    await persistenceModule.restore();

    renderMotionRuntime = await renderMotionModule.mount(rootElement);
    const mountedRuntime = renderMotionRuntime;
    telemetryModule.syncStateFromReadModel();
    inputPathModule.bindToCanvas(mountedRuntime.canvas);

    if (DIAGNOSTIC_HOOKS_ENABLED) {
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
          telemetryRecordCount: telemetryModule.getBufferedRecords().length,
          telemetry: telemetryModule.getSessionSnapshot(),
          persistence: persistenceModule.getLastSnapshot(),
          platformLifecycle: platformYandexModule.getLifecycleLog(),
        });
      };
    }
  } catch (error: unknown) {
    const reason = toErrorMessage(error);

    await cleanupBootstrapRuntime(
      renderMotionRuntime,
      () => inputPathModule.dispose(),
      () => telemetryModule.stop(),
      () => persistenceModule.dispose(),
      () => platformYandexModule.dispose(),
    ).catch((cleanupError: unknown) => {
      console.error('[main] Cleanup after bootstrap failure failed.', cleanupError);
    });

    renderBootstrapFailState(rootElement, reason, visualSystemModule.tokens);
    installFailureHooks(reason);

    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  console.error('[main] Bootstrap failed.', error);
});
