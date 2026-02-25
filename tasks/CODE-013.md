# [CODE]-[013] Выделить и проверить независимый алгоритм распознавания bonus-слов

## Что сделано

- Добавлен отдельный runtime-слой словаря для bonus-валидации:
  - `src/domain/WordValidation/runtime-dictionary.ts`;
  - `createRuntimeDictionaryResources(csvContent)` строит:
    - `bonusLookupWords` для `WordValidation`;
    - `levelGeneratorEntries` для `LevelGenerator`.
- Обновлён bootstrap:
  - `src/main.ts` создаёт `CoreState` с явным wiring словаря из `data/dictionary.csv`;
  - bonus-классификация больше не опирается на узкий fallback-набор.
- Добавлены тесты:
  - `tests/word-validation.runtime-dictionary.test.ts` (индекс словаря + независимый bonus lookup);
  - `tests/core-state.scoring.test.ts` (bonus-зачёт при раздельных словарных пулах генератора и валидации).
- `BACKLOG.md`: задача `[CODE]-[013]` отмечена выполненной.

## Верификация

- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - `output/web-game-code013-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-038: Независимый runtime dictionary lookup для bonus-валидации](../ADR/ADR-038-independent-bonus-dictionary-runtime-code-013.md)
