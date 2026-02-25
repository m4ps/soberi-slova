# CHANGELOG

## 2026-02-25

### [CODE]-[008] Реализовать RenderMotion и one-screen UI без лишних сущностей

- `src/adapters/RenderMotion/index.ts` переписан в полноценный one-screen рендер:
  - всегда видимые `grid 5x5`, `progress x/N`, `all-time score`, кнопки `hint/reshuffle/leaderboard`;
  - pseudo-liquid in-drag/tail-undo feedback;
  - success feedback: green/yellow glow + перелёт букв в HUD;
  - auto-ack completion pipeline (`AcknowledgeWordSuccessAnimation` и `AcknowledgeLevelTransitionDone`) с отложенными jobs.
- `src/application/contracts.ts` и `src/application/index.ts` расширены новым доменным событием `domain/word-submitted`:
  - событие публикуется на `SubmitPath` и включает `result`, `scoreDelta`, `progress`, `pathCells`, `wordSuccessOperationId`;
  - success-анимации в `RenderMotion` запускаются от domain event, а не от state mutation в UI.
- Добавлен единый layout helper `src/shared/game-layout.ts` и синхронизирован `InputPath`:
  - `src/adapters/InputPath/index.ts` теперь разрешает path input только в пределах grid-области;
  - path snapshots прокидываются в рендер для drag-visual feedback.
- Расширены тесты:
  - `tests/application-command-bus.smoke.test.ts` (payload `domain/word-submitted`);
  - `tests/input-path.adapter.test.ts` (layout-aware pointer + path snapshot callback);
  - `tests/render-layout.test.ts` (инварианты one-screen layout и приоритет grid на малых экранах).
- Обновлены документация и артефакты:
  - `docs/observability/event-contracts.md`;
  - `README.md`.

### [CODE]-[007] Интегрировать Rewarded Ads outcomes в help flows

- `src/adapters/PlatformYandex/index.ts` расширен ad-flow оркестрацией:
  - добавлен вызов `ysdk.adv.showRewardedVideo` по событию `domain/help` (`phase=requested`, `requiresAd=true`);
  - callback outcomes `onRewarded/onClose/onError` маппятся в команду `AcknowledgeAdResult` с `durationMs` и `outcomeContext`;
  - добавлена дедупликация ad-callback цепочки (single dispatch на одну `operationId`);
  - добавлены lifecycle-события адаптера для ad-наблюдаемости (`rewarded-ad-requested/open/rewarded/close/error/no-fill/ack-*`).
- `src/domain/HelpEconomy/index.ts` усилен контрактом временного cooldown:
  - введён `HELP_AD_FAILURE_COOLDOWN_MS = 3000` и состояние cooldown в `HelpWindowState`;
  - после `close/error/no-fill` для ad-required операций включается shared lock обеих help-кнопок на 3 секунды;
  - `requestHelp` поддерживает решение `cooldown`, возвращающее время до разблокировки и причину.
- `src/application/index.ts` и `src/application/contracts.ts` синхронизированы с ad outcomes:
  - `RequestHint/RequestReshuffle` при активном cooldown возвращают `domainError` `help.request.cooldown`;
  - событие `domain/help` (`phase=ad-result`) теперь несёт `durationMs`, `outcomeContext`, `cooldownApplied`, `cooldownDurationMs`, `toastMessage`.
- Расширены тесты:
  - `tests/help-economy.module.test.ts`: новый сценарий cooldown после `no-fill`;
  - `tests/application-command-bus.smoke.test.ts`: проверка блокировки help-запроса в cooldown и расширенного payload `domain/help`;
  - `tests/platform-yandex.adapter.test.ts`: проверка rewarded-flow, no-fill mapping и fallback без `adv` API.
- Синхронизирована документация:
  - `docs/observability/event-contracts.md`;
  - `README.md`.

### [CODE]-[006] Реализовать HelpEconomy: free-window 5 минут, hint progression, manual reshuffle

- `src/domain/HelpEconomy/index.ts` переведён с заглушки на stateful help-economy модуль:
  - real-time окно `5 минут` (`HELP_WINDOW_DURATION_MS`) с авто-восстановлением `freeActionAvailable` по текущему времени;
  - shared lock через `pendingRequest` для `hint/reshuffle` (re-entrant-safe поведение);
  - `free action` списывается только в `finalizePendingRequest(..., applied=true)`.
- `src/domain/CoreState/index.ts` расширен help-эффектами:
  - добавлен `applyHelp(kind, operationId)` c idempotency-guard по `operationId`;
  - `hint`: выбор самого лёгкого оставшегося target-слова + progression раскрытия `2/3/4+` букв;
  - `reshuffle`: полный reset текущего уровня через `LevelGenerator` с переходом `active -> reshuffling -> active(next-level-id)`;
  - добавлены типизированные help-результаты (`CoreStateHelpApplyResult`, `CoreStateHintEffect`, `CoreStateReshuffleEffect`).
- `src/application/index.ts` интегрирован с новым help-flow:
  - `RequestHint/RequestReshuffle` теперь применяют help-effect (при free-now) до публикации `domain/help` события;
  - при `ad-required` сохраняется pending lock, повторный help-клик возвращает `domainError` `help.request.locked`;
  - `AcknowledgeAdResult` финализирует pending help operation и снимает lock.
- `src/application/contracts.ts` и `docs/observability/event-contracts.md` синхронизированы:
  - `domain/help` payload расширен полями `operationId`, `requiresAd`, `applied`.
- `src/domain/GameState/index.ts` + `docs/data/game-state-schema.md` синхронизированы под manual reshuffle:
  - в same-level переходах разрешён `active -> reshuffling`, что поддерживает ручной reset уровня.
- `src/main.ts` теперь инициализирует `HelpEconomy` из `CoreState.helpWindow`, чтобы сохранять корректную точку отсчёта free-window состояния.
- Добавлены тесты:
  - `tests/help-economy.module.test.ts` (real-time timer, consumption semantics, shared lock/re-entrancy);
  - `tests/core-state.help.test.ts` (hint progression, manual reshuffle reset, help idempotency);
  - `tests/application-command-bus.smoke.test.ts` расширен интеграционным сценарием shared-lock + ad-ack unlock;
  - `tests/game-state.model.test.ts` синхронизирован с обновлённой transition-моделью.
- Полная верификация:
  - `npm run ci:baseline` — passed;
  - Playwright smoke (`$WEB_GAME_CLIENT`) — passed, артефакты: `output/web-game-code006-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`; `errors-*.json` отсутствуют.

### [CODE]-[005] Реализовать completion pipeline и автопереход уровня

- `src/domain/CoreState/index.ts` расширен completion state-machine для финального target:
  - `submitPath` больше не начисляет `level clear` мгновенно; финальный target фиксирует только `word score`, переводит уровень в `completed` и создаёт pending operation `word-success-animation`;
  - добавлены `acknowledgeWordSuccessAnimation(operationId)` и `acknowledgeLevelTransitionDone(operationId)` с idempotent обработкой по `operationId`;
  - `level clear` начисляется ровно один раз только на `acknowledgeWordSuccessAnimation` и переводит уровень в `reshuffling` (full input lock);
  - `acknowledgeLevelTransitionDone` генерирует новый уровень через `LevelGenerator`, переводит сессию в новый `active` level и сохраняет `allTimeScore`.
- Snapshot `CoreState` дополнен transition-индикаторами:
  - `isInputLocked`, `showEphemeralCongrats`;
  - `pendingWordSuccessOperationId`, `pendingLevelTransitionOperationId`.
- `src/application/index.ts` синхронизирован с новым пайплайном:
  - `SubmitPath` использует `wordSuccessOperationId` как `correlationId`, если операция создана;
  - команды `AcknowledgeWordSuccessAnimation` и `AcknowledgeLevelTransitionDone` теперь сначала применяют state-transition в `CoreState`, затем публикуют event envelope.
- Тесты обновлены:
  - `tests/core-state.scoring.test.ts` — проверка полного pipeline (`completed -> reshuffling -> active(next)`), single-award level clear, lock ввода и idempotent duplicate-ack;
  - `tests/application-command-bus.smoke.test.ts` — интеграционная проверка completion flow через command bus.
- Полная верификация:
  - `npm run ci:baseline` — passed;
  - Playwright smoke (`$WEB_GAME_CLIENT`) — passed, артефакты: `output/web-game-code005-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`; `errors-*.json` отсутствуют.

### [CODE]-[004] Реализовать CoreState scoring/progression в state-first порядке

- `src/domain/CoreState/index.ts` переведён со stub-модуля на stateful доменный контур:
  - snapshot `CoreState` теперь включает `runtimeMode + gameState + gameplay` (score/progress/status/found sets);
  - добавлен `submitPath(pathCells)` с state-first apply через `WordValidation`;
  - реализованы формулы PRD:
    - `target: 10 + 2 * len`;
    - `bonus: 2 + len`;
    - `level clear: 30 + 5 * N`;
  - реализована идемпотентность начислений:
    - `repeat/invalid` — silent no-op;
    - `level clear` начисляется ровно один раз при последнем `target`;
    - после `levelStatus=completed` bonus/target submit не начисляют очки (anti-farm guard).
- `src/application/index.ts` (`SubmitPath`) переведён на state-first порядок:
  - commit доменного состояния выполняется до публикации `application/command-routed`, чтобы animation/event-цепочка работала поверх уже зафиксированного score/progress.
- Добавлены тесты:
  - `tests/core-state.scoring.test.ts` — формулы очков, `x/N` progression, idempotency repeat, запрет bonus после completion;
  - `tests/application-command-bus.smoke.test.ts` — integration-check, что score уже обновлён в момент `command-routed` для `SubmitPath`.
- Полная верификация:
  - `npm run ci:baseline` — passed;
  - Playwright smoke (`$WEB_GAME_CLIENT`) — passed, артефакты: `output/web-game-code004-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`; `errors-*.json` отсутствуют.

### [CODE]-[003] Реализовать WordValidation и apply-логику target/bonus/repeat

- `src/domain/WordValidation/index.ts` расширен с базовой валидации слова до submit-path контракта:
  - добавлен `resolveWordFromPath(grid, pathCells)` для сборки и нормализации слова из пути `5x5`;
  - добавлены `validatePathWord` и `applyPathWord` с однозначной классификацией `target|bonus|repeat|invalid`;
  - apply-логика обновляет `foundTargets/foundBonuses` только для `target/bonus`;
  - повторно найденные и невалидные слова возвращаются как silent-ignore (`isSilent=true`) без изменения state.
- Классификация приведена к deterministic-порядку:
  - dictionary lookup -> repeat check -> target check -> bonus fallback.
- Нормализация слов и сравнение валидации сохраняют различие `ё` и `е` (без схлопывания букв).
- Добавлен unit-suite `tests/word-validation.test.ts`:
  - проверки всех исходов валидации;
  - проверки сборки слова из `pathCells`, включая malformed grid/path;
  - проверка контракта `ё != е`;
  - проверки apply-семантики (repeat/invalid не меняют state).

### [CODE]-[002] Реализовать InputPath для swipe-драг ввода и tail-undo

- `src/adapters/InputPath/index.ts` переведён со stub на рабочий gesture-driven адаптер:
  - добавлен `InputPathEngine` с правилами `8-way adjacency`, запретом повторного использования клетки и `tail-undo` только на предыдущую клетку;
  - невалидные клетки и повторы мягко игнорируются без штрафов и без сброса пути;
  - submit слова переведён на `pointerup` через dispatch `SubmitPath(pathCells)`; `pointercancel` завершает жест без submit;
  - добавлена привязка к `pointerId` активного жеста, чтобы исключить конфликт multi-touch во время одного ввода.
- Добавлен helper `resolveGridCellFromPointer` для детерминированного маппинга координат указателя в `5x5` grid.
- Добавлен unit-suite `tests/input-path.adapter.test.ts`:
  - проверки маппинга координат в сетку;
  - проверки path-инвариантов (`adjacency`, `tail-undo`, ignore repeated/non-adjacent);
  - проверки submit-контракта (`only on pointerup`, `no submit on pointercancel`, `dispose` отписывает listeners).

### [CODE]-[001] Реализовать LevelGenerator (word-first, 5x5, anti-repeat, rejection rules)

- `src/domain/LevelGenerator/index.ts` переведён со stub на рабочий deterministic генератор уровней:
  - генерация управляется `seed` и воспроизводима при фиксированном входе;
  - target-набор формируется в диапазоне `3..7` с обязательным присутствием `short (3..4)`, `medium (5..6)` и минимум одного `long (>=7)` слова;
  - подбор слов учитывает `rank` и anti-repeat по `recentTargetWords` (с fallback при нехватке новых слов);
  - реализована word-first укладка слов в `5x5` по 8 направлениям с разрешёнными пересечениями одинаковых букв;
  - добавлены частичные retry-механики без полного сброса набора: замена проблемного слова и локальный backtracking;
  - добавлены rejection rules по редким буквам (`ъ/ы/ь/й/щ`) для target-набора и итогового grid.
- Публичный контракт `LevelGenerator` расширен выходными данными:
  - `grid`, `targetWords`, `placements` (пути слов) и `meta` (`generationAttempts`, `replacements`, `backtracks`, метрики редких букв).
- Добавлен unit-suite `tests/level-generator.test.ts`:
  - инварианты генерации и валидность путей;
  - детерминизм по фиксированному seed;
  - anti-repeat поведение;
  - negative-сценарии (`invalid seed`, неполный словарь без обязательных категорий).
- `README.md` синхронизирован с новым контрактом генератора и текущим статусом закрытия `CODE-001`.

### [DATA]-[194] Приведение data-слоя к production-quality

- `src/domain/GameState/index.ts` приведён к единому стилю migration/state-констант:
  - введены именованные константы для schema-version и default-сентинелов (`v0/v1/v2`, `stateVersion=0`, sentinel leaderboard);
  - migration chain переведён на константные версии без дублирования числовых литералов;
  - migration utility `findSnapshotMigrationStepByFromVersion` и step-check (`expectedNextVersion`) сделаны более читаемыми и единообразными.
- `src/domain/WordValidation/dictionary-pipeline.ts` очищен от магических чисел в CSV-проходе:
  - индексы header/data-row, шаги прохода, счётчики и sentinel missing-column вынесены в именованные константы;
  - код parse/iterate веток стал декларативнее без изменения поведения pipeline.
- Синхронизирована документация data-слоя:
  - `docs/data/game-state-schema.md`;
  - `docs/data/dictionary-pipeline.md`;
  - `README.md`.

### [DATA]-[193] Анализ безопасности модели данных

- Усилен security-контур `GameState` (`src/domain/GameState/index.ts`):
  - критичные счётчики/версии/timestamp валидируются как non-negative safe integer (`game-state.validation.safe-integer`);
  - добавлены guard-инварианты `pendingOps`:
    - лимит размера массива (`<= 128`);
    - запрет дублей `operationId`;
    - проверка timeline `updatedAt >= createdAt`;
  - добавлены guard-инварианты `leaderboardSync`:
    - `lastAckScore <= lastSubmittedScore <= allTimeScore`;
    - `lastSubmitTs=0` при `lastSubmittedScore=0`;
  - расширены transition-проверки при `previousState`:
    - запрет регрессии `stateVersion`, `updatedAt`, `allTimeScore`;
    - запрет потери `foundTargets/foundBonuses` в пределах того же `levelId`.
- Усилен security-контур dictionary pipeline (`src/domain/WordValidation/dictionary-pipeline.ts`):
  - добавлены runtime guards на invalid input type и oversized CSV/header/row;
  - добавлена защита от overflow rank payload (`rank` только `0..Number.MAX_SAFE_INTEGER`);
  - index lookup API сделан runtime-safe для нестроковых входов (возвращает `false/null` вместо throw).
- Расширены unit-тесты:
  - `tests/game-state.model.test.ts` — security-кейсы для overflow/consistency/regression guards;
  - `tests/word-validation.dictionary-pipeline.test.ts` — security-кейсы oversized CSV, invalid rank и runtime-safe lookup.
- Синхронизирована документация:
  - `docs/data/game-state-schema.md`;
  - `docs/data/dictionary-pipeline.md`;
  - `README.md`.

### [DATA]-[192] Удаление дублирования схем, DTO и валидаторов

- Добавлен единый модуль data-контрактов [`src/domain/data-contract.ts`](src/domain/data-contract.ts):
  - `normalizeCyrillicWord`;
  - `isLowercaseCyrillicWord`;
  - `isLowercaseCyrillicLetter`;
  - `isLengthInRange`;
  - `parseStrictIntegerString`;
  - `parseFiniteNumberString`.
- `src/domain/WordValidation/dictionary-pipeline.ts` переведён на shared data-helpers:
  - нормализация/проверка слов и парсинг `id/rank` больше не дублируются локально.
- `src/domain/GameState/index.ts` переведён на shared validators:
  - правила кириллицы (`а-я`, `ё`) и диапазон длины target-слов используют единый модуль.
- В `GameState` сокращено дублирование DTO-описаний:
  - идентичные `*Input` типы консолидированы через type aliases;
  - input-типы с частичными отличиями оформлены через `extends Omit<...>`.
- Сокращено дублирование parse/validate веток в `to*Input` функциях `GameState` через повторное
  использование runtime-конструкторов `create*`.
- Добавлен новый unit-suite [`tests/data-contract.test.ts`](tests/data-contract.test.ts) для
  shared data-helpers.
- Синхронизирована документация:
  - `docs/data/game-state-schema.md`;
  - `docs/data/dictionary-pipeline.md`;
  - `README.md`.

### [DATA]-[191] Удаление ненужных структур и полей данных

- Сужена snapshot-схема `GameState` до v1-необходимого набора полей:
  - из `PendingHelpRequest` удалено deprecated поле `requestedAt`;
  - `GAME_STATE_SCHEMA_VERSION` повышена до `2`.
- В `src/domain/GameState/index.ts` добавлена миграция `v1 -> v2`, которая:
  - удаляет out-of-scope legacy поля (`sessionScore`, `achievements`, `dailyQuests`, `tutorialTrace/tutorialTraces`) из snapshot;
  - очищает `helpWindow.pendingHelpRequest` от `requestedAt`.
- Обновлены unit-тесты `tests/game-state.model.test.ts`:
  - миграционный сценарий `v0` теперь проверяет полную цепочку `v0 -> v1 -> v2`;
  - добавлен тест на зачистку legacy/out-of-scope полей в миграции `v1 -> v2`.
- Синхронизирована документация:
  - `docs/data/game-state-schema.md` (schema `v2`, обновлённая migration chain);
  - `README.md` (актуальный статус data-схемы и закрытие DATA-191).

### [DATA]-[190] Приборка этапа модели данных

- Зафиксирован воспроизводимый cleanup data-этапа: в `package.json` добавлен `npm run clean:data`.
  - Команда удаляет временные артефакты data-контура (`*.tmp`, `*.dump`, `*.draft`) и переиспользует общий cleanup (`dist/`, `output/`, `.DS_Store`, `progress.md`).
- В `.gitignore` добавлены data-паттерны для одноразовых CSV/JSON артефактов:
  - `data/*.tmp.*`;
  - `data/*.dump.*`;
  - `data/*.draft.*`.
- README синхронизирован:
  - добавлена команда `clean:data` в список инженерных скриптов;
  - добавлено правило по data-очистке в разделе `Data Model & Dictionary Schema`;
  - обновлён `Текущий статус` с закрытием DATA-190.

### [DATA]-[005] Контракты событий и сквозной correlationId для наблюдаемости

- `src/application/contracts.ts` переведён на versioned event envelope:
  - добавлен `EventEnvelope` с полями `{ eventId, eventType, eventVersion, occurredAt, correlationId, payload }`;
  - добавлены типизированные domain events: `domain/word-success`, `domain/level-clear`, `domain/help`, `domain/persistence`, `domain/leaderboard-sync`;
  - `CommandAck` расширен обязательным `correlationId`.
- `src/application/index.ts` обновлён на единый publish-path событий:
  - добавлены генерация `eventId` и fallback-генерация `correlationId`;
  - `application/command-routed` публикуется с обязательным `correlationId`;
  - для ключевых операций публикуются domain events с тем же `correlationId` (сквозная цепочка маршрутизации).
- Обновлена интеграция и тесты:
  - `src/adapters/PlatformYandex/index.ts` переведён на envelope-поля `eventType`/`occurredAt`;
  - `tests/application-command-bus.smoke.test.ts` расширен проверками event-schema, минимальных domain events и correlation chain;
  - `tests/platform-yandex.adapter.test.ts` синхронизирован с новым `CommandAck`.
- Добавлена документация observability-схемы: `docs/observability/event-contracts.md`.
- README синхронизирован с DATA-005 и новой event schema.

### [DATA]-[004] Snapshot schema-versioning, миграции и LWW conflict resolver

- В `src/domain/GameState/index.ts` реализована migration-aware обработка snapshot:
  - добавлен детерминированный migration chain `vN -> vN+1` (`v0 -> v1`);
  - добавлены API `migrateGameStateSnapshot` и `deserializeGameStateWithMigrations`;
  - `deserializeGameState` переведён на миграционный путь восстановления.
- Добавлен LWW resolver `resolveLwwSnapshot(local, cloud)` по контракту TECHSPEC:
  - primary key: `stateVersion`;
  - tie-break: `updatedAt`;
  - полный tie: приоритет `local` snapshot.
- Усилен data-контракт ошибок:
  - snapshot с будущей `schemaVersion` отклоняется как unsupported;
  - invalid local/cloud snapshot в merge-контуре отклоняется контролируемой `GameStateDomainError`.
- Обновлён unit-test suite `tests/game-state.model.test.ts`:
  - миграция legacy snapshot `v0 -> v1` и её детерминированность;
  - reject future schema;
  - LWW разрешение конфликтов по всем tie-break этапам;
  - поддержка serialized snapshot входов в resolver.
- Обновлена документация snapshot-контракта:
  - `docs/data/game-state-schema.md`;
  - `README.md` (раздел Data Model & Dictionary Schema).

### [DATA]-[003] Pipeline словаря из CSV (normalization + filtering)

- Добавлен модуль [`src/domain/WordValidation/dictionary-pipeline.ts`](src/domain/WordValidation/dictionary-pipeline.ts):
  - реализован `buildDictionaryIndexFromCsv` для загрузки словаря из CSV в in-memory индекс;
  - реализована нормализация `trim + lowercase` с сохранением различий `ё` и `е`;
  - добавлена фильтрация строк по правилам PRD (`type=noun`, только `а-яё`, без спецсимволов);
  - добавлена дедупликация по `normalized` (в индекс попадает первое валидное вхождение);
  - добавлена статистика отбраковки `rejectedByReason` для telemetry/log (`malformed-row`, `invalid-id`, `invalid-rank`, `invalid-type`, `empty-word`, `not-lowercase`, `non-cyrillic-word`, `duplicate-word`).
- `src/domain/WordValidation/index.ts` переведён на единый normalizer `normalizeDictionaryWord` и дополнен ре-экспортом API dictionary pipeline.
- Добавлен unit-test suite [`tests/word-validation.dictionary-pipeline.test.ts`](tests/word-validation.dictionary-pipeline.test.ts):
  - проверка нормализации/фильтрации и reject-статистики на синтетическом CSV;
  - проверка typed-error при отсутствии обязательных колонок в header;
  - проверка загрузки реального `data/dictionary.csv` с доступной telemetry-статистикой.
- Добавлена документация pipeline: [`docs/data/dictionary-pipeline.md`](docs/data/dictionary-pipeline.md).
- README синхронизирован с новым dictionary data-контрактом.

### [DATA]-[002] Инварианты и валидаторы состояния

- В `src/domain/GameState/index.ts` добавлена доменная ошибка `GameStateDomainError` (`code/message/retryable/context`) и type-guard `isGameStateDomainError`.
- Реализована runtime-валидация инвариантов `LevelSession`:
  - grid строго `5x5` (`25` ячеек);
  - только нижняя кириллица (`а-я`, `ё`) для `grid`, `targetWords`, `foundTargets`, `foundBonuses`;
  - `targetWords` строго в диапазоне `3..7`;
  - запрет дублей в `targetWords`, `foundTargets`, `foundBonuses`;
  - `foundTargets` только из target-набора;
  - `foundBonuses` не содержат target-слова;
  - `foundTargets` и `foundBonuses` не пересекаются.
- Добавлена проверка однонаправленных переходов статуса уровня:
  - в рамках одного `levelId`: `active -> active|completed`, `completed -> completed|reshuffling`, `reshuffling -> reshuffling`;
  - смена `levelId` разрешена только при `reshuffling -> active`.
- `createGameState` расширен опцией `previousState` для runtime-валидации status transition при построении следующего snapshot.
- Обновлён test suite `tests/game-state.model.test.ts`:
  - добавлены unit-тесты на каждое критичное правило инвариантов;
  - добавлены проверки кодов доменных ошибок;
  - добавлен позитивный тест разрешённого перехода `reshuffling -> active(next level)`.
- Документация синхронизирована: обновлены `docs/data/game-state-schema.md` и `README.md`.
- Полная верификация выполнена:
  - `npm run ci:baseline` — green;
  - Playwright smoke (`$WEB_GAME_CLIENT`) — green, артефакты в `output/web-game-data002-smoke`, `errors-*.json` отсутствуют.

### [DATA]-[001] Доменные сущности состояния игры

- Добавлен модуль [`src/domain/GameState/index.ts`](src/domain/GameState/index.ts) как единый source of truth для state-модели:
  - `GameState`, `LevelSession`, `HelpWindow`, `PendingHelpRequest`, `PendingOperation`, `LeaderboardSyncState`, `WordEntry`.
- Реализованы runtime-конструкторы всех сущностей с fail-fast проверками типов и безопасными default-полями snapshot (`schemaVersion`, `stateVersion`, `pendingOps`).
- Добавлен JSON snapshot контракт:
  - `serializeGameState` / `deserializeGameState`;
  - `serializeWordEntry` / `deserializeWordEntry`.
- Добавлен новый тестовый suite [`tests/game-state.model.test.ts`](tests/game-state.model.test.ts) с проверками:
  - runtime-конструкторов;
  - deep-copy поведения;
  - round-trip сериализации/десериализации без потери структуры;
  - controlled-failure на malformed payload.
- Документация схемы добавлена в [`docs/data/game-state-schema.md`](docs/data/game-state-schema.md), README синхронизирован с новым data-модулем.
- Полная верификация выполнена: `npm run ci:baseline` green + Playwright smoke (`$WEB_GAME_CLIENT`) с артефактами в `output/web-game-data001-smoke` и без `errors-*.json`.

### [INIT]-[094] Приведение кода этапа к единому стандарту

- Введён единый shared-слой init-стандарта: добавлены `src/shared/errors.ts` (единый `toErrorMessage`) и `src/shared/module-ids.ts` (единый реестр идентификаторов модулей).
- Устранены дубли утилиты обработки ошибок в `main`, `application` и `PlatformYandex`; все три контура используют общий helper из `src/shared/errors.ts`.
- Все init-модули (`CoreState`, `HelpEconomy`, `LevelGenerator`, `WordValidation`, `InputPath`, `Persistence`, `RenderMotion`, `PlatformYandex`, `Telemetry`) переведены на единый источник `moduleName` через `MODULE_IDS`, что исключает рассинхронизацию строковых литералов.
- README синхронизирован с фактической структурой исходников: добавлен каталог `src/shared/`.
- Полная верификация пройдена: `npm run ci:baseline` green + Playwright smoke (`$WEB_GAME_CLIENT`) с артефактами в `output/web-game-init094-smoke-clean`.

### [INIT]-[093] Анализ безопасности этапа инициализации

- Проведён security-review bootstrap-поверхности init-слоя и зафиксирован чеклист в [`docs/security/init-bootstrap-checklist.md`](docs/security/init-bootstrap-checklist.md).
- В `PlatformYandex` добавлен hardening загрузки SDK: runtime loader принимает только trusted same-origin источник `/sdk.js`.
- Усилено fail-closed поведение bootstrap: при ошибке фиксируется `bootstrap-failed`, выполняется rollback lifecycle-подписок и остановка gameplay (если был запущен).
- `main.ts` переведён на controlled failure path: при сбое bootstrap выполняется cleanup частично поднятых модулей и показывается технический fail-state.
- Добавлены security-тесты `tests/platform-yandex.adapter.test.ts`:
  - reject untrusted sdk script source;
  - rollback gameplay/listeners при падении dispatch `RuntimeReady`.
- Проверка на hardcoded secrets выполнена по init-контуру (`src/`, `config/`, `scripts/`, `tests/`, `.github/workflows`) — секреты не обнаружены.

### [INIT]-[092] Удаление дублирования в конфигурации и bootstrap-логике

- Вынесены дублирующиеся bootstrap-константы YaGames в единый модуль [`src/config/platform-yandex.ts`](src/config/platform-yandex.ts): `sdk.js` path, lifecycle event names, script marker и timeout.
- `PlatformYandex` адаптер и его контрактный тест переведены на shared-константы, что устранило расхождения строковых литералов в runtime/test коде.
- Добавлен единый конфиг портов [`config/runtime-ports.json`](config/runtime-ports.json) и общий runner [`scripts/run-sdk-dev-proxy.mjs`](scripts/run-sdk-dev-proxy.mjs) для `dev:proxy`/`dev:proxy:prod`.
- `vite.config.ts` теперь использует тот же источник портов, что и proxy-runner, чтобы исключить конфликтующие значения dev/preview/proxy окружений.
- В application bus сокращён шаблонный routed-command код через helper’ы `routeCommand`/`routeHelpCommand` без изменения поведения маршрутизации.
- README синхронизирован с новым единым конфигом портов и proxy-runner.
- Полная верификация пройдена: `npm run ci:baseline` green + Playwright smoke (`$WEB_GAME_CLIENT`) с артефактами в `output/web-game-init092-smoke`.

## 2026-02-24

### [INIT]-[091] Удаление ненужного кода и зависимостей этапа

- Выполнена ревизия зависимостей: `depcheck` не выявил лишних пакетов, текущий набор `dependencies/devDependencies` оставлен минимальным и обоснованным для init/v1 scope.
- Из `Application`-контракта удалены неиспользуемые bootstrap-зависимости `WordValidation` и `LevelGenerator`, которые не участвуют в текущем command-routing.
- Обновлён composition root `src/main.ts`: исключён неиспользуемый wiring доменных модулей, чтобы не включать мёртвый код в entry-контур.
- Обновлён smoke-тест `tests/application-command-bus.smoke.test.ts` под новый минимальный набор обязательных зависимостей application-слоя.
- Прогон baseline-сборки подтверждён (`typecheck/test/lint/format:check/build`), baseline-бандл не увеличен.
- В `BACKLOG.md` добавлена follow-up задача `[TEST]-[007]` для стабилизации Playwright smoke в TLS-контуре `sdk-dev-proxy`.

### [INIT]-[090] Приборка init-этапа и удаление временных артефактов

- Удалён временный агентский журнал `progress.md`; хранение факта выполненных работ закреплено через `CHANGELOG.md` и `tasks/*.md`.
- `.gitignore` дополнен правилом `progress.md`, чтобы временные handoff-файлы не попадали в репозиторий.
- Добавлен скрипт `npm run clean:init` для воспроизводимой локальной приборки init-артефактов (`dist/`, `output/`, `.DS_Store`, `progress.md`).
- README обновлён: добавлена команда `clean:init` в список инженерных скриптов.

### [OPS] GitHub Actions deploy workflow для GitHub Pages

- Добавлен workflow `.github/workflows/deploy-pages.yml` для автоматического деплоя в GitHub Pages при `push` в `main` и вручную (`workflow_dispatch`).
- В deploy-пайплайн добавлены обязательные baseline quality-gates (`npm run ci:baseline`) перед публикацией артефакта.
- Для корректной работы на `https://<owner>.github.io/<repo>/` добавлена сборка Vite с `--base="/<repo-name>/"` внутри deploy workflow.
- README дополнен инструкциями по GitHub Actions и требованием включить `Build and deployment: GitHub Actions` в настройках Pages.

### [INIT]-[005] Инженерный baseline quality-gates + CI

- Добавлены baseline quality-команды: `lint`, `lint:fix`, `format`, `format:check`, `ci:baseline`.
- Подключены `eslint` (flat-config для TypeScript) и `prettier` с едиными настройками форматирования baseline-файлов.
- Добавлен CI workflow `.github/workflows/ci.yml` с pre-merge последовательностью, совместимой с TECHSPEC gates: `typecheck -> test -> lint -> format:check -> build`.
- README дополнен разделом обязательного pre-merge pipeline и обновлённым списком инженерных команд.

### [INIT]-[004] Platform bootstrap YaGames SDK + dev-proxy

- `PlatformYandex` переведён со stub на рабочий адаптер: добавлены `YaGames.init()`, `LoadingAPI.ready()`, `GameplayAPI.start()/stop()` и обработчики `game_api_pause`/`game_api_resume`.
- Добавлен структурированный lifecycle-log платформенного адаптера с наблюдаемостью через `window.render_game_to_text`.
- Усилен bootstrap-контур: `RuntimeReady` теперь dispatch-ится только после успешной инициализации SDK lifecycle.
- Добавлен контрактный тест `tests/platform-yandex.adapter.test.ts` (bootstrap, pause/resume wiring, dispose/unsubscribe, ошибка при отсутствии SDK).
- Добавлена локальная инфраструктура запуска через `@yandex-games/sdk-dev-proxy` (`dev:proxy`, `dev:proxy:prod`) и обновлён README с инструкциями для dev/draft/prod режимов.

### [INIT]-[003] Command bus, Result Envelopes и доменные ошибки

- В application-слое введён единый typed bus с контрактами `ApplicationCommand` и `ApplicationQuery`.
- Добавлены обязательные команды v1 из TECHSPEC: `SubmitPath`, `RequestHint`, `RequestReshuffle`, `AcknowledgeAdResult`, `AcknowledgeWordSuccessAnimation`, `AcknowledgeLevelTransitionDone`, `Tick`, `RestoreSession`, `SyncLeaderboard`.
- Реализован единый `Result envelope` формата `ok | domainError | infraError` и унифицированный `Error envelope` `{ code, message, retryable, context }`.
- Добавлен query-bus (`GetCoreState`, `GetHelpWindowState`) и связанный read-model поверх него.
- Обновлены адаптеры `InputPath`, `PlatformYandex`, `Persistence` на новые команды/queries bus-контракта.
- Добавлен интеграционный smoke-тест `tests/application-command-bus.smoke.test.ts`, проверяющий маршрутизацию обязательных команд и корректность error envelope.

### [INIT]-[002] Архитектурные слои и модульные границы

- Внедрена слоистая структура `src/domain`, `src/application`, `src/adapters` по правилу зависимостей `Adapters -> Application -> Domain`.
- Добавлены публичные контракты-заглушки модулей: `CoreState`, `InputPath`, `WordValidation`, `LevelGenerator`, `HelpEconomy`, `RenderMotion`, `PlatformYandex`, `Persistence`, `Telemetry`.
- `src/main.ts` переведён в роль composition root: wiring модулей выполняется через application-слой без прямых зависимостей верхнего слоя на domain.
- Добавлен автоматический guard-тест `tests/architecture-boundaries.test.ts`, проверяющий import-граф на нарушение слоёв.
- README дополнен диаграммой и описанием архитектурных модулей.
- Для typecheck тестов добавлена зависимость `@types/node`.

### [INIT]-[001] Bootstrap проекта

- Создан стартовый каркас проекта на TypeScript + PixiJS v8 + Vite.
- Добавлены базовые директории `src/`, `assets/`, `tests/`, а также `ADR/` и `tasks/` для проектного контура.
- Реализована точка входа с пустым игровым экраном в portrait-only viewport и единым canvas.
- Добавлены hooks `window.render_game_to_text` и `window.advanceTime(ms)` для автоматизированного smoke-тестирования игрового рендера.
- Настроены scripts: `dev`, `build`, `preview`, `typecheck`, `test`, `test:watch`.
- Добавлен smoke unit test на контракт портретного viewport.
- Подготовлен README с фиксированной структурой директорий и инструкциями запуска.
