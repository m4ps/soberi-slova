# Dictionary Pipeline Schema (DATA-003)

## Цель

Построить детерминированный in-memory индекс словаря из `data/dictionary.csv` для доменной валидации слов.

## Runtime API

Модуль: `src/domain/WordValidation/dictionary-pipeline.ts`
Общие data-правила переиспользуются из `src/domain/data-contract.ts`.

- `buildDictionaryIndexFromCsv(csvContent)`
  - Вход: сырой CSV-текст.
  - Выход:
    - `index`:
      - `size`;
      - `normalizedWords: ReadonlySet<string>`;
      - `hasNormalizedWord(normalizedWord)` — O(1) lookup по normalized слову;
      - `containsWord(word)` — lookup после `trim+lowercase` нормализации;
      - `getEntryByNormalizedWord(normalizedWord)`.
    - `stats`:
      - `totalRows`;
      - `acceptedRows`;
      - `rejectedRows`;
      - `rejectedByReason`.
- `normalizeDictionaryWord(word)` — `trim + lowercase`.
- `isValidNormalizedDictionaryWord(word)` — проверка паттерна `^[а-яё]+$`.

## Правила нормализации и фильтрации

- `type` строго `noun`.
- `bare` должен быть уже в lower-case форме (строки с uppercase отбраковываются).
- В `bare` разрешены только символы `а-яё`.
- `ё` и `е` считаются разными буквами (без схлопывания).
- Пустые строки словаря пропускаются.
- Дубли `normalized` слов отбраковываются (в индекс попадает первое валидное вхождение).

## Reject статистика

Поддерживаемые причины отбраковки:

- `malformed-row`
- `invalid-id`
- `invalid-rank`
- `invalid-type`
- `empty-word`
- `not-lowercase`
- `non-cyrillic-word`
- `duplicate-word`

Эта статистика возвращается из pipeline и может напрямую публиковаться в telemetry/log контур.
