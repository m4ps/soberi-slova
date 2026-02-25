# [DATA]-[005] Формализовать контракты событий и correlationId для наблюдаемости

## Что сделано

- `src/application/contracts.ts` переведён на единый event envelope:
  - добавлен `EventEnvelope` с полями `{ eventId, eventType, eventVersion, occurredAt, correlationId, payload }`;
  - определён минимальный набор domain events:
    - `domain/word-success`;
    - `domain/level-clear`;
    - `domain/help`;
    - `domain/persistence`;
    - `domain/leaderboard-sync`;
  - `CommandAck` расширен обязательным `correlationId`.
- `src/application/index.ts` обновлён под новый контракт:
  - добавлена генерация `eventId` и fallback-генерация `correlationId`;
  - routed-команды публикуются через `application/command-routed` c обязательным `correlationId`;
  - для ключевых операций публикуются типизированные domain events с тем же `correlationId`.
- Обновлены адаптеры и тесты:
  - `src/adapters/PlatformYandex/index.ts` переведён на envelope-поля `eventType`/`occurredAt`;
  - `tests/application-command-bus.smoke.test.ts` проверяет:
    - форму envelope для всех событий;
    - публикацию минимальных domain events;
    - сквозной correlation chain (`command-routed -> domain event`);
  - `tests/platform-yandex.adapter.test.ts` синхронизирован с новым `CommandAck`.
- Документация:
  - добавлен `docs/observability/event-contracts.md` (схема событий и correlation rules);
  - `README.md` синхронизирован с DATA-005.

## Верификация

- `npm run typecheck` — passed.
- `npm run test -- tests/application-command-bus.smoke.test.ts tests/platform-yandex.adapter.test.ts` — passed.
- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-data005-smoke`;
  - использован временный `public/sdk.js` mock для `/sdk.js`, после прогона удалён;
  - артефакты: `output/web-game-data005-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-018: Unified event envelope и сквозной correlationId для observability](../ADR/ADR-018-event-envelope-correlation-data-005.md)
