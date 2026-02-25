# ADR-026: WordValidation submit-path классификация и apply-логика

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [CODE]-[003]

## Контекст

Для задачи `CODE-003` требовалось реализовать доменный контур проверки слова по `submit-path`:

- собирать слово из пути по grid (`5x5`) и нормализовать его;
- различать исходы `target`, `bonus`, `repeat`, `invalid`;
- обеспечивать полный silent-ignore для повторно найденных слов;
- сохранить инвариант `ё != е` по всему пути валидации.

До изменения `WordValidation` умел только базовую проверку `word + dictionary`, без path-based apply-контракта и без явного state-update поведения для found sets.

## Решение

1. Расширить `WordValidation` API до submit-path уровня:
   - `resolveWordFromPath(grid, pathCells)`;
   - `validatePathWord(...)`;
   - `applyPathWord(...)`.
2. Зафиксировать однозначный порядок классификации:
   - dictionary lookup;
   - repeat check;
   - target check;
   - bonus fallback.
3. Реализовать apply-логику только для `target/bonus`:
   - `target` -> append в `foundTargets`;
   - `bonus` -> append в `foundBonuses`;
   - `repeat/invalid` -> state не меняется, `isSilent=true`.
4. Сохранить буквенный контракт словаря без упрощений:
   - нормализация через lowercase/trim;
   - `ё` и `е` считаются разными буквами.

## Последствия

- В `WordValidation` появился deterministic и тестируемый доменный контракт submit-path валидации.
- Повторные слова теперь явно и централизованно обрабатываются как silent-ignore без state drift.
- Модуль готов как входной слой для следующего этапа `CODE-004` (`CoreState scoring/progression`), где будет добавлено начисление очков и progression-логика поверх уже зафиксированной классификации.
