# [CODE]-[001] Реализовать LevelGenerator (word-first, 5x5, anti-repeat, rejection rules)

## Что сделано

- `src/domain/LevelGenerator/index.ts` переведён с stub на полноценный модуль генерации уровней:
  - детерминированная генерация по `seed`;
  - выбор target-набора `3..7` с обязательными `short/medium/long` категориями;
  - anti-repeat приоритет по `recentTargetWords` (с fallback);
  - укладка слов word-first через path search по 8 направлениям с пересечениями;
  - частичные ретраи без полного сброса набора (замена проблемного слова + локальный backtracking);
  - заполнение пустых клеток и rejection по редким буквам (`ъ/ы/ь/й/щ`).
- Публичный контракт генератора расширен: помимо `targetWords` возвращаются `grid`, `placements` и `meta`.
- Добавлен unit-test suite `tests/level-generator.test.ts`:
  - проверки инвариантов уровня и корректности путей;
  - проверка детерминизма при фиксированном `seed`;
  - проверка anti-repeat поведения;
  - негативные сценарии (`invalid seed`, неполный словарь без обязательных категорий).
- Синхронизированы артефакты документации:
  - `README.md` (описание генератора и статус задачи);
  - `BACKLOG.md` (задача `[CODE]-[001]` отмечена выполненной);
  - `CHANGELOG.md`.

## Верификация

- `npm run test` — passed.
- `npm run ci:baseline` — passed (`typecheck`, `test`, `lint`, `format:check`, `build`).
- Playwright smoke (`develop-web-game` client) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-code001-smoke`;
  - артефакты: `output/web-game-code001-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-024: Детерминированный LevelGenerator с эвристиками word-first](../ADR/ADR-024-level-generator-heuristics-code-001.md)
