# [CODE]-[009] Реализовать PlatformYandex, Persistence, Restore и Leaderboard end-to-end

## Что сделано

- Реализован рабочий persistence bridge в `PlatformYandex` (`src/adapters/PlatformYandex/index.ts`):
  - `readPersistenceState` читает local snapshot + cloud snapshot + cloud score hint;
  - `writePersistenceState` пишет snapshot в `safeStorage` (с fallback на `localStorage`) и в player mirror (`setData` + `setStats`);
  - manual leaderboard sync выполняет auth-диалог по явному действию;
  - добавлен retry/backoff pipeline для `leaderboards.setScore`, не блокирующий gameplay loop.
- Реализован production persistence adapter (`src/adapters/Persistence/index.ts`):
  - добавлен persisted envelope (`schemaVersion/capturedAt/gameStateSerialized/helpWindow`);
  - restore pipeline local/cloud -> `RestoreSession(payload)` -> post-restore flush;
  - добавлен auto-flush по domain событиям, которые меняют score/help/level.
- Расширен `CoreState` (`src/domain/CoreState/index.ts`):
  - добавлен `restoreSession(...)` с LWW merge и fallback на новый активный уровень при нересторибельной level-сессии;
  - добавлена защита `allTimeScore` через max-merge с cloud stats hint.
- Расширен `HelpEconomy` (`src/domain/HelpEconomy/index.ts`):
  - добавлен `restoreWindowState(...)` для восстановления free-action timer и очистки transient lock/cooldown состояния.
- Синхронизирован application-слой:
  - `RestoreSession` теперь принимает typed payload persisted snapshots;
  - `domain/word-success` и `domain/leaderboard-sync` обогащены score-полями для platform sync (`src/application/contracts.ts`, `src/application/index.ts`).
- Обновлён bootstrap wiring (`src/main.ts`):
  - порядок запуска: `PlatformYandex.bootstrap()` -> `Persistence.restore()`;
  - добавлен `persistence.dispose()` в cleanup path.

## Верификация

- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск:
    `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-code009-smoke`;
  - артефакты: `output/web-game-code009-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.
  - для smoke использовался временный `public/sdk.js` mock; после прогона удалён.

## Принятые решения

- [ADR-032: Platform/Persistence restore pipeline и leaderboard sync queue](../ADR/ADR-032-platform-persistence-restore-leaderboard-code-009.md)
