# ADR-040: Runtime-guards для входа уровня в gameplay под инварианты v1.1

- Статус: accepted
- Дата: 2026-03-08
- Связанные задачи: [DATA]-[007]

## Контекст

Для `v1.1` data-layer должен fail-fast отклонять уровни и snapshot-состояния, которые нарушают новые инварианты:

- `targetWords` только в диапазоне `10..15`;
- минимум `10` читаемых short/medium target-слов;
- short/medium слова должны преобладать над long;
- `readabilityScore` должен оставаться finite, неотрицательным и в безопасном диапазоне;
- `currentDisplayedTargetId` не может указывать на уже найденное слово, если в уровне ещё есть ненайденные target-слова.

Без этого malformed snapshot или старый generator output могли попадать в активный gameplay state и ломать guided target-loop уже после restore/reshuffle/auto-next перехода.

## Решение

1. Закрепить `createLevelSession(...)` как единый runtime trust-boundary для v1.1 level-инвариантов:
   - диапазон `10..15`;
   - минимум `10` readable target-слов длиной `3..6`;
   - short/medium prevalence;
   - bounded `readabilityScore`.
2. Оставить `createGameState(...)` единственной точкой auto-normalize для guided target state:
   - stale `currentDisplayedTargetId` заменяется на ближайшую валидную ненайденную цель;
   - при отсутствии ненайденных target-слов pointer сбрасывается в `null`;
   - `currentHintPathProgress` сбрасывается при нормализации pointer.
3. Валидировать каждый новый уровень до входа в gameplay и в `CoreState`:
   - generator output сначала нормализуется в `LevelSessionInput`;
   - затем прогоняется через `createLevelSession(...)`;
   - при ошибке генерации или нарушении data-инвариантов gameplay получает встроенный known-good fallback level вместо невалидного состояния.

## Последствия

- Невалидные уровни отсекаются до входа в активный gameplay snapshot.
- Restore/reshuffle/auto-next перестают зависеть от того, что внешний источник уровня всегда корректен.
- Guided target pointer становится детерминированным и не может зависнуть на уже найденном слове.
- Runtime-схема становится строже уже сейчас, при этом пользователь не получает hard-fail в середине игрового цикла.
