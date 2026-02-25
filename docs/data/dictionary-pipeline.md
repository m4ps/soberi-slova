# Dictionary Pipeline Schema (DATA-003 / DATA-194)

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
- `rank` должен быть числом в диапазоне `0..Number.MAX_SAFE_INTEGER` (защита от overflow/negative rank payload).
- Пустые строки словаря пропускаются.
- Дубли `normalized` слов отбраковываются (в индекс попадает первое валидное вхождение).

## Security Guards (DATA-193)

- `buildDictionaryIndexFromCsv` проверяет, что вход — строка; иначе выбрасывается typed error `dictionary-pipeline.invalid-input`.
- Добавлены size guards на CSV payload:
  - общий размер: до `5_000_000` символов (`dictionary-pipeline.csv-too-large`);
  - длина header row: до `8_192` символов (`dictionary-pipeline.header-too-large`);
  - длина data row > `8_192` считается `malformed-row` и безопасно отбрасывается.
- Позиции header/data-row и счётчики обработки вынесены в именованные константы (`CSV_HEADER_LINE_INDEX`, `CSV_FIRST_DATA_LINE_INDEX`, `COUNTER_*`), чтобы убрать магические числа из прохода CSV.
- Индексные lookup API (`hasNormalizedWord`, `containsWord`, `getEntryByNormalizedWord`) runtime-safe для нестроковых значений: возвращают `false/null` вместо падения.

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
