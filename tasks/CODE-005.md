# [CODE]-[005] Реализовать completion pipeline и автопереход уровня

## Что сделано

- Реализован completion pipeline в `src/domain/CoreState/index.ts`:
  - `submitPath` для последнего target начисляет только `word score`, переводит уровень в `completed` и создаёт pending operation `word-success-animation`;
  - добавлены методы:
    - `acknowledgeWordSuccessAnimation(operationId)` — начисляет `level clear`, переводит в `reshuffling`, создаёт pending `level-transition`;
    - `acknowledgeLevelTransitionDone(operationId)` — выполняет auto-next и переводит в новый `active` уровень;
  - ввод блокируется при `levelStatus !== active` (во время `completed/reshuffling`);
  - auto-next использует `LevelGenerator` и сохраняет `allTimeScore` без потерь.
- Расширен gameplay snapshot `CoreState`:
  - `isInputLocked`;
  - `showEphemeralCongrats`;
  - `pendingWordSuccessOperationId`;
  - `pendingLevelTransitionOperationId`.
- Обновлён `src/application/index.ts`:
  - `SubmitPath` привязывает `correlationId` к `wordSuccessOperationId`, если операция создана;
  - `AcknowledgeWordSuccessAnimation` и `AcknowledgeLevelTransitionDone` теперь применяют state-transition в `CoreState` до публикации событий.
- Обновлены тесты:
  - `tests/core-state.scoring.test.ts` — полный pipeline `completed -> reshuffling -> active(next)`, single-award level clear, lock ввода, duplicate-ack no-op;
  - `tests/application-command-bus.smoke.test.ts` — интеграция completion flow через command bus.
- Синхронизированы артефакты проекта:
  - `BACKLOG.md` (`[CODE]-[005]` отмечена выполненной);
  - `CHANGELOG.md`;
  - `README.md`;
  - `ADR/ADR-028-completion-pipeline-auto-next-code-005.md`.

## Верификация

- `npm run test -- tests/core-state.scoring.test.ts tests/application-command-bus.smoke.test.ts` — passed.
- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-code005-smoke`;
  - артефакты: `output/web-game-code005-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют;
  - для локального smoke использовался временный `public/sdk.js` mock, удалён после прогона.

## Принятые решения

- [ADR-028: Completion pipeline и auto-next через acknowledge-команды](../ADR/ADR-028-completion-pipeline-auto-next-code-005.md)
