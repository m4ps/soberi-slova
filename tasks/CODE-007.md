# [CODE]-[007] Интегрировать Rewarded Ads outcomes в help flows

## Что сделано

- Реализована интеграция rewarded ads в `PlatformYandex` (`src/adapters/PlatformYandex/index.ts`):
  - адаптер подписывается на `domain/help` событие (`phase=requested`, `requiresAd=true`);
  - вызывает `ysdk.adv.showRewardedVideo` и маппит callbacks `onRewarded/onClose/onError` в `AcknowledgeAdResult`;
  - добавляет `durationMs` и `outcomeContext` в ad-ack команду;
  - защищает flow от double-dispatch через single-resolution guard на `operationId`.
- Усилен `HelpEconomy` (`src/domain/HelpEconomy/index.ts`):
  - добавлен cooldown на no-reward ad outcomes (`close/error/no-fill`) длительностью `3 сек`;
  - `HelpWindowState` расширен полями cooldown (`cooldownUntilTs`, `cooldownMsRemaining`, `cooldownReason`);
  - `requestHelp` возвращает новый тип решения `cooldown`, если кнопки временно заблокированы.
- Синхронизирован application-контракт (`src/application/contracts.ts`, `src/application/index.ts`):
  - `AcknowledgeAdResult` принимает `durationMs` и `outcomeContext`;
  - `domain/help` (`phase=ad-result`) публикует расширенный telemetry payload:
    `durationMs`, `outcomeContext`, `cooldownApplied`, `cooldownDurationMs`, `toastMessage`;
  - help-запросы в период cooldown возвращают `domainError` `help.request.cooldown`.
- Обновлены тесты:
  - `tests/help-economy.module.test.ts` — cooldown после `no-fill`;
  - `tests/application-command-bus.smoke.test.ts` — блокировка help-запросов во время cooldown;
  - `tests/platform-yandex.adapter.test.ts` — rewarded-flow, no-fill mapping, fallback при отсутствии `adv` API.

## Верификация

- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-code007-smoke`;
  - артефакты: `output/web-game-code007-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-030: Rewarded Ads outcomes, cooldown и event-driven orchestration](../ADR/ADR-030-rewarded-ads-outcome-cooldown-code-007.md)
