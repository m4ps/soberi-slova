# [DATA]-[002] Закрепить инварианты и валидаторы состояния

## Что сделано

- Усилен модуль `src/domain/GameState/index.ts`:
  - добавлены `GameStateDomainError` и `isGameStateDomainError`;
  - реализованы runtime-инварианты `LevelSession`:
    - grid строго `5x5` (`25` ячеек);
    - только нижняя кириллица (`а-я`, `ё`) для `grid`, `targetWords`, `foundTargets`, `foundBonuses`;
    - `targetWords` строго в диапазоне `3..7`;
    - запрет дублей в `targetWords`, `foundTargets`, `foundBonuses`;
    - `foundTargets` только из target-набора;
    - `foundBonuses` не содержат target-слова;
    - `foundTargets` и `foundBonuses` не пересекаются.
- Добавлена проверка однонаправленных переходов статуса:
  - новый API `assertLevelSessionTransition(previousSession, nextSession)`;
  - `createGameState` расширен опцией `previousState` для runtime-валидации перехода.
- Обновлён unit-test suite `tests/game-state.model.test.ts`:
  - добавлены тесты на каждое критичное правило инвариантов;
  - добавлены проверки `code` доменной ошибки;
  - добавлен позитивный тест разрешённого перехода `reshuffling -> active(next level)`.
- Документация синхронизирована:
  - обновлены `docs/data/game-state-schema.md` и `README.md`.

## Верификация

- `npm run ci:baseline` — passed (`typecheck`, `test`, `lint`, `format:check`, `build`).
- Playwright smoke (`develop-web-game` client) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-data002-smoke`
  - для локального smoke временно использован mock `/sdk.js`; после прогона удалён;
  - артефакты: `output/web-game-data002-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-015: Runtime-инварианты state-модели и доменная ошибка валидации](../ADR/ADR-015-data-state-invariants-data-002.md)
