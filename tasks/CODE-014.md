# [CODE]-[014] Пофиксить незачет target-слов при реальной разгадке в UI

## Что сделано

- Исправлена классификация submit-path слов в `src/domain/WordValidation/index.ts`:
  - target-зачёт больше не блокируется словарной проверкой;
  - применён порядок `repeat -> target -> bonus(dictionary) -> invalid`.
- Добавлены регрессионные тесты:
  - `tests/word-validation.test.ts` — target засчитывается даже при отсутствии слова в dictionary index;
  - `tests/core-state.scoring.test.ts` — `CoreState.submitPath` начисляет очки за target из level session при узком словаре.
- Подтверждение через browser E2E:
  - сценарий `[TEST]-[012]` после фикса стабильно фиксирует изменение прогресса и очков на реальном свайпе.

## Верификация

- `npm run test -- tests/word-validation.test.ts tests/core-state.scoring.test.ts` — passed.
- `npm run test:e2e:test-012` — passed.
- `npm run ci:baseline` — passed.

## Принятые решения

- [ADR-037: Target-first классификация в WordValidation для submit-path](../ADR/ADR-037-target-priority-word-validation-code-014-test-012.md)
