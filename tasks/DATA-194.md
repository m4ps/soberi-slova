# [DATA]-[194] Приведение data-слоя к production-quality

## Что сделано

- Приведён к единому стилю `src/domain/GameState/index.ts`:
  - версии snapshot-схемы (`v0/v1/v2`), default/sentinel значения и migration step вынесены в именованные константы;
  - migration chain переведён на константные версии без дублирования литералов;
  - улучшена читаемость migration utility (`findSnapshotMigrationStepByFromVersion`, `expectedNextVersion`).
- Приведён к единому стилю `src/domain/WordValidation/dictionary-pipeline.ts`:
  - индексы строк CSV, шаги инкремента и счётчики вынесены в константы;
  - удалены «магические» `0/1/-1` из ключевой логики parse/iterate.
- Синхронизирована документация data-слоя:
  - `docs/data/game-state-schema.md`;
  - `docs/data/dictionary-pipeline.md`;
  - `README.md`.
- `BACKLOG.md`: задача `[DATA]-[194]` отмечена выполненной.
- `CHANGELOG.md`: добавлена запись по выполненной задаче.

## Верификация

- `npm run ci:baseline` — passed.

## Принятые решения

- [ADR-023: Production-quality стандартизация data-layer (константы и migration utilities)](../ADR/ADR-023-data-layer-production-quality-data-194.md)
