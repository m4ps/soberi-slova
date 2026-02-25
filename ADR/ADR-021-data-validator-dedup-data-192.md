# ADR-021: Консолидация data-валидаторов и DTO в data-слое

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [DATA]-[192]

## Контекст

В data-слое накопилось дублирование:
- повторные правила кириллицы/`ё`, length range и numeric parsing в `GameState` и
  `WordValidation/dictionary-pipeline`;
- повторные описания идентичных `Entity/Input` типов в `GameState`.

Это повышает риск рассинхронизации контрактов между валидацией snapshot-состояния и pipeline словаря.

## Решение

1. Вынести общие data-rules в единый модуль `src/domain/data-contract.ts`:
   - `normalizeCyrillicWord`;
   - `isLowercaseCyrillicWord`;
   - `isLowercaseCyrillicLetter`;
   - `isLengthInRange`;
   - `parseStrictIntegerString`;
   - `parseFiniteNumberString`.
2. Перевести `GameState` и `WordValidation/dictionary-pipeline` на shared helpers из
   `data-contract`.
3. Консолидировать DTO-повторы в `GameState`:
   - идентичные `*Input` типы оформить как type aliases к доменным сущностям;
   - для частично отличающихся input-структур использовать `extends Omit<...>` вместо
     копирования полного shape.
4. Сократить дубли parsing/validation веток в `to*Input` функциях через переиспользование
   существующих runtime-конструкторов `create*`.

## Последствия

- Критичные правила валидации зафиксированы в одном месте и переиспользуются в обоих data-модулях.
- Снижена вероятность расхождения DTO/Entity контрактов в `GameState`.
- Поведение runtime-валидации и migration/deserialization сохранено, подтверждено тестами и `ci:baseline`.
