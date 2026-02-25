# ADR-022: Security guards для data-границ snapshot и dictionary pipeline

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [DATA]-[193]

## Контекст

Data-слой является trust-boundary для внешних и потенциально повреждённых payload:
- snapshot из local/cloud restore (включая SDK storage/player data);
- CSV словаря (`data/dictionary.csv`) и его runtime загрузка.

До DATA-193 базовые проверки уже были, но оставались риски:
- overflow/precision corruption числовых счётчиков и timestamp;
- неконсистентные переходы при построении следующего state (`previousState -> nextState`);
- неконсистентные `pendingOps/leaderboardSync` комбинации;
- отсутствие size guard для oversized CSV payload.

## Решение

1. Усилить `GameState` runtime guards:
   - критичные числовые поля валидировать как non-negative safe integer;
   - ограничить `pendingOps` (лимит длины, уникальность `operationId`, `updatedAt >= createdAt`);
   - ввести consistency rules для `leaderboardSync` (`lastAck <= lastSubmitted <= allTimeScore`);
   - при `previousState` запретить регрессию `stateVersion/updatedAt/allTimeScore` и потерю найденных слов в пределах одного `levelId`.
2. Усилить `dictionary-pipeline`:
   - добавить guards на invalid input type и oversized CSV/header/row;
   - валидировать `rank` в диапазоне `0..Number.MAX_SAFE_INTEGER`;
   - сделать index lookup runtime-safe для нестроковых входов (возврат `false/null` вместо throw).
3. Все нарушения обрабатывать как controlled ошибки (`GameStateDomainError` / `DictionaryPipelineError`) либо controlled reject-статистику строк CSV без падения приложения.

## Последствия

- Повышена устойчивость data-слоя к malformed/overflow payload.
- Снижен риск corruption в restore/LWW и telemetry-driven dictionary ingestion.
- Поведение security-границ формализовано unit-тестами и документировано.
