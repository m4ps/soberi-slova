# ADR-039: Единые shared-утилиты для grid/hint и runtime guard-валидации

- Статус: accepted
- Дата: 2026-02-26
- Связанные задачи: [CODE]-[292]

## Контекст

В кодовой базе накопилось дублирование критичной логики:

- `CoreState` и `RenderMotion` независимо реализовывали:
  - выбор и сортировку hint target-слов;
  - DFS-поиск пути слова по `5x5` grid.
- `CoreState`, `Application`, `Persistence`, `PlatformYandex` дублировали одни и те же runtime guard-функции для разбора payload (`isRecordLike`, `parseNonNegativeSafeInteger`).

Это создавало риск расхождения поведения между слоями domain/ui и увеличивало стоимость сопровождения.

## Решение

1. Вынести общую grid/hint-логику в `src/shared/word-grid.ts`:
   - `findWordPathInGrid`;
   - `sortWordsByDifficulty` / `compareWordsByDifficulty`;
   - единые ключи мета-полей hint (`HINT_META_TARGET_WORD_KEY`, `HINT_META_REVEAL_COUNT_KEY`).
2. Вынести общие runtime guards в `src/shared/runtime-guards.ts`:
   - `isRecordLike`;
   - `parseNonNegativeSafeInteger`.
3. Подключить shared-утилиты в `CoreState`, `RenderMotion`, `Application`, `Persistence`, `PlatformYandex`.
4. Зафиксировать поведение unit-тестами shared-модулей.

## Последствия

- Критичная логика hint/grid и базовые payload guards определены в одном месте.
- Уменьшен риск поведенческих расхождений между domain/application/ui.
- Дальнейшие изменения бизнес-правил выполняются через shared-модули без копирования веток кода.
