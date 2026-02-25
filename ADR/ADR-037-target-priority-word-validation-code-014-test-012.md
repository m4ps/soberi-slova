# ADR-037: Target-first классификация в WordValidation для submit-path

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [TEST]-[012], [CODE]-[014]

## Контекст

В browser E2E сценарии `[TEST]-[012]` воспроизведён дефект: target-слово из dev-debug (`[dev][target-words]`) имело валидный путь на grid и вводилось реальным swipe, но не засчитывалось (`x/N` и score не менялись).

Корневая причина: в `WordValidation` проверка dictionary выполнялась раньше target-проверки. Для уровней после reshuffle/auto-next target-набор формировался генератором шире, чем dictionary lookup по умолчанию в `WordValidation`, из-за чего целевое слово ошибочно классифицировалось как `invalid`.

## Решение

1. Изменить порядок классификации в `WordValidation`:
   - `repeat` (если слово уже найдено),
   - `target` (если слово присутствует в `targetWords` уровня),
   - `bonus` (только для слов, найденных в dictionary),
   - `invalid`.
2. Считать `targetWords` уровня source of truth для target-зачёта в submit-flow.
3. Сохранить словарную проверку обязательной для bonus-слов.

## Последствия

- Target-слова уровня теперь засчитываются стабильно при реальном browser swipe независимо от ширины dictionary lookup по умолчанию.
- Bonus-валидация остаётся словарной и не ослабляется.
- Добавлены регрессионные unit и browser E2E тесты, предотвращающие возврат дефекта.
