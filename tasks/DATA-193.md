# [DATA]-[193] Анализ безопасности модели данных

## Что сделано

- Выполнен security-review data-границ и усилены guard-проверки в `GameState`:
  - для критичных счётчиков/версий/timestamp введена проверка non-negative safe integer;
  - для `pendingOps` добавлены инварианты:
    - лимит массива (`<= 128`);
    - уникальность `operationId`;
    - timeline check `updatedAt >= createdAt`;
  - для `leaderboardSync` добавлены инварианты:
    - `lastAckScore <= lastSubmittedScore <= allTimeScore`;
    - `lastSubmitTs=0` при `lastSubmittedScore=0`;
  - для `previousState -> nextState` добавлены анти-регрессионные проверки:
    - `stateVersion`, `updatedAt`, `allTimeScore` не уменьшаются;
    - в рамках одного `levelId` нельзя терять `foundTargets/foundBonuses`.
- Усилен `WordValidation/dictionary-pipeline` на границах повреждённых CSV payload:
  - runtime guard на invalid input type;
  - size guards для CSV/header/row;
  - rank guard `0..Number.MAX_SAFE_INTEGER` (overflow/negative значения отбраковываются как `invalid-rank`);
  - index lookup API сделан runtime-safe для нестроковых входов (`false/null` вместо throw).
- Расширены unit-тесты security-кейсами:
  - `tests/game-state.model.test.ts`;
  - `tests/word-validation.dictionary-pipeline.test.ts`.
- Синхронизированы документы:
  - `docs/data/game-state-schema.md`;
  - `docs/data/dictionary-pipeline.md`;
  - `README.md`;
  - `CHANGELOG.md`;
  - `BACKLOG.md` (`[DATA]-[193]` отмечена выполненной).

## Верификация

- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск:
    `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-data193-smoke`;
  - использован временный `public/sdk.js` mock для `/sdk.js`, после прогона удалён;
  - артефакты: `output/web-game-data193-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-022: Security guards для data-границ snapshot и dictionary pipeline](../ADR/ADR-022-data-security-guards-data-193.md)
