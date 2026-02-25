# [DATA]-[004] Реализовать snapshot schema-versioning, миграции и LWW conflict resolver

## Что сделано

- В `src/domain/GameState/index.ts` реализован migration-aware snapshot pipeline:
  - добавлен deterministic migration chain `vN -> vN+1`;
  - добавлен шаг `v0 -> v1` (проставление `schemaVersion`, нормализация `stateVersion` и `pendingOps`);
  - добавлены функции `migrateGameStateSnapshot` и `deserializeGameStateWithMigrations`;
  - `deserializeGameState` переведён на migration-aware путь восстановления.
- Добавлен LWW conflict resolver `resolveLwwSnapshot(local, cloud)`:
  - primary comparison по `stateVersion`;
  - tie-break по `updatedAt`;
  - при полном tie приоритет у local snapshot.
- Добавлена controlled-failure обработка для unsupported future schema и невалидных local/cloud snapshot в merge-контуре.
- Расширен test suite `tests/game-state.model.test.ts`:
  - deterministic миграции legacy snapshot `v0 -> v1`;
  - reject future schema;
  - LWW-resolve кейсы по всем tie-break этапам;
  - поддержка serialized snapshot входов.
- Обновлена документация:
  - `docs/data/game-state-schema.md`;
  - `README.md`.

## Верификация

- `npm run typecheck` — passed.
- `npm run test -- tests/game-state.model.test.ts` — passed.
- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-data004-smoke`;
  - использован временный `public/sdk.js` mock для `/sdk.js`, после прогона удалён;
  - артефакты: `output/web-game-data004-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-017: Snapshot schema-versioning и LWW merge для restore](../ADR/ADR-017-snapshot-versioning-lww-data-004.md)
