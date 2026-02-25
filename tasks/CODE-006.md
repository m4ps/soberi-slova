# [CODE]-[006] Реализовать HelpEconomy: free-window 5 минут, hint progression, manual reshuffle

## Что сделано

- Реализован полноценный `HelpEconomy` в `src/domain/HelpEconomy/index.ts`:
  - real-time окно бесплатного действия `5 минут`;
  - shared lock для `hint/reshuffle` через `pendingRequest`;
  - финализация help-операции с контролируемым списанием free-action только при `applied=true`.
- Интегрирован help-flow в `application` (`src/application/index.ts`):
  - `RequestHint` / `RequestReshuffle` теперь запускают доменный help-пайплайн;
  - при активном pending help повторные запросы блокируются (`help.request.locked`);
  - `AcknowledgeAdResult` снимает pending lock и финализирует операцию.
- Расширен `CoreState` (`src/domain/CoreState/index.ts`) API `applyHelp(kind, operationId)`:
  - `hint` раскрывает `2/3/4+` букв у самого лёгкого оставшегося target-слова;
  - `reshuffle` выполняет полный reset уровня (новый level session, очищенный level progress);
  - применён idempotency guard по `operationId`.
- Синхронизированы data-инварианты и документация:
  - `src/domain/GameState/index.ts`: разрешён same-level переход `active -> reshuffling`;
  - `docs/data/game-state-schema.md` и `docs/observability/event-contracts.md` обновлены под новый контракт.
- Обновлён `main.ts`: `HelpEconomy` инициализируется из текущего `CoreState.helpWindow` для корректного восстановления таймера.

## Верификация

- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-code006-smoke`;
  - артефакты: `output/web-game-code006-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-029: HelpEconomy free-window, hint progression и manual reshuffle](../ADR/ADR-029-help-economy-hint-reshuffle-code-006.md)
