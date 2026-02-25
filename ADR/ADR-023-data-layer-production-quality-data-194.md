# ADR-023: Production-quality стандартизация data-layer (константы и migration utilities)

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [DATA]-[194]

## Контекст

После закрытия DATA-193 data-слой уже был функционально корректен, но в `GameState` и
`dictionary-pipeline` оставались несогласованные числовые литералы в migration/CSV-pass логике:

- версии `schemaVersion` и migration step использовались частично как литералы;
- default/sentinel значения (`stateVersion=0`, leaderboard empty submit) были размазаны по проверкам;
- CSV-проход использовал неименованные индексы и инкременты (`0/1/-1`) в нескольких местах.

Это усложняло поддержку и повышало риск неявных расхождений при дальнейших изменениях.

## Решение

1. Централизовать числовые sentinel/version ограничения в именованные константы:
   - `GameState`: schema version aliases (`v0/v1/v2`), default state version, migration step increment, leaderboard empty sentinel.
   - `dictionary-pipeline`: header/data line indexes, counter increments, missing-column sentinel.
2. Выравнять naming migration-утилит в `GameState`, чтобы pipeline читался как единая цепочка
   с явным `expectedNextVersion`.
3. Не менять внешний API и доменное поведение, ограничившись readability/maintainability рефакторингом.

## Последствия

- Data-layer стал проще для ревью и расширения (меньше «магических чисел», более предсказуемая migration логика).
- Снижен риск регрессий при добавлении новых schema-version шагов и модификации CSV pipeline.
- Документация синхронизирована с текущим стилем реализации.
