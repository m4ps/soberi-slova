# ADR-042: LevelGenerator v1.1 как readability-first генератор 10..15 target-слов

- Статус: accepted
- Дата: 2026-03-08
- Связанные задачи: [CODE]-[015]

## Контекст

`GameState` и runtime guards уже были переведены на `v1.1` инварианты:

- уровень обязан содержать `10..15` target-слов;
- минимум `10` слов должны быть short/medium (`3..6`);
- short/medium слова должны преобладать;
- `readabilityScore` уровня не должен выходить за safe bound.

Старый `LevelGenerator` оставался в контракте `v1`:

- `3..7` target-слов;
- обязательный `long`-слот;
- отбор и самопроверка ориентировались на mix short/medium/long, а не на readability-first набор.

Это расходилось с runtime-инвариантами и делало generator output непредсказуемым для guided target-word loop `v1.1`.

## Решение

1. Перевести `LevelGenerator` на диапазон `10..15`.
2. Сделать отбор слов readability-first:
   - сначала добирать minimum `10` short/medium слов;
   - short-слова выбирать с повышенным приоритетом относительно medium;
   - long-слова больше не требовать и использовать только как fallback, если нужен добор до requested count.
3. Оставить deterministic anti-repeat окно по `recentTargetWords`.
4. Добавить rejection rules по читаемости на двух уровнях:
   - target-набор отклоняется, если не выполняет minimum/predominance/readability-score;
   - layout отклоняется, если пути получаются слишком ломанными или grid концентрирует слишком много слов в одной клетке.
5. Сохранить deterministic path placement, но упорядочить стартовые клетки и соседей по readability-first эвристикам:
   - меньше поворотов;
   - меньше диагональных шагов;
   - controlled reuse уже занятых клеток вместо случайного шума.

## Последствия

- Generator output теперь согласован с `GameState` и `TECHSPEC` без дополнительных runtime fallback'ов.
- Длинные слова перестали быть продуктовым обязательством, а short/medium набор стал основным источником стабильности и читаемости.
- Deterministic tests по seed и anti-repeat покрывают новый контракт и снижают риск регрессии при дальнейшей настройке эвристик.
