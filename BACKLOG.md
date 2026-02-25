# BACKLOG — Endless Word Grid v1

Ниже задачи расположены в оптимальном порядке исполнения по этапам: сначала фундамент и контракты, затем реализация core-loop, затем верификация и финальное security-hardening.

## Этап 1: Инициализация

- [x] [INIT]-[001] Bootstrap проекта (TypeScript + PixiJS v8 + Yandex Games runtime)
Task Context: Создай каркас проекта с нуля под mobile-first portrait-only single-screen игру для Яндекс Игр; подготовь `src/`, `assets/`, `tests/`, базовую точку входа, сборку и dev-режим; стек строго TypeScript + PixiJS v8, без серверной части.
Task DOD: Проект собирается и запускается локально одной командой; отображается пустой игровой экран в портретном viewport; структура директорий и scripts зафиксированы в README.

- [x] [INIT]-[002] Внедрить архитектурные слои и модульные границы из TECHSPEC
Task Context: Реализуй strict layered dependency model `UI/Input/Render/Platform -> Application -> CoreState/Domain`; создай модули `CoreState`, `InputPath`, `WordValidation`, `LevelGenerator`, `HelpEconomy`, `RenderMotion`, `PlatformYandex`, `Persistence`, `Telemetry` с пустыми контрактами.
Task DOD: Есть compile-time границы (imports не нарушают слой); каждый модуль имеет публичный интерфейс; добавлена диаграмма/описание архитектуры в документацию проекта.

- [x] [INIT]-[003] Подготовить command bus, envelopes результатов и доменные ошибки
Task Context: Введи typed `Command/Query` контракты и единый `Result envelope` (`ok | domainError | infraError`), а также ошибку формата `{ code, message, retryable, context }`; добавь заготовки команд из TECHSPEC (`SubmitPath`, `RequestHint`, `RequestReshuffle`, `Tick`, `RestoreSession` и др.).
Task DOD: Все application use-cases вызываются через единый bus; типы команд и ошибок покрывают обязательные команды v1; есть минимум один интеграционный smoke-test, подтверждающий корректную маршрутизацию команды.

- [x] [INIT]-[004] Реализовать platform bootstrap для YaGames SDK и локального dev-proxy
Task Context: Подключи `YaGames.init()`, `LoadingAPI.ready()`, `GameplayAPI.start/stop`, обработчики pause/resume; организуй локальный цикл через `@yandex-games/sdk-dev-proxy --dev-mode=true` с моками SDK.
Task DOD: В dev-режиме приложение стартует через proxy без runtime ошибок SDK; lifecycle события корректно логируются; есть инструкции запуска draft/prod-тест режима в README.

- [x] [INIT]-[005] Настроить инженерный baseline (lint/typecheck/build/format)
Task Context: Добавь quality-гейты для раннего контроля: `lint`, `typecheck`, `build`, `test` (пусть пока smoke); подготовь скрипты для CI в последовательности, совместимой с TECHSPEC gates.
Task DOD: Все baseline-команды проходят на чистом проекте; CI-конфиг валиден; документация описывает обязательный pre-merge pipeline.

- [x] [INIT]-[090] Приборка этапа и удаление временных артефактов
Task Context: Удали черновые файлы, экспериментальные скрипты, временные ассеты и неиспользуемые bootstrap-заглушки, появившиеся в этапе инициализации.
Task DOD: В репозитории нет временных файлов/директорий от инициализации; рабочее дерево содержит только целевые исходники и документацию.

- [x] [INIT]-[091] Удаление ненужного кода и зависимостей этапа
Task Context: Проведи ревизию зависимостей и стартового кода; исключи пакеты и модули, не участвующие в v1 scope (включая вырезанный MVP cut-list функционал).
Task DOD: `package`-зависимости минимальны и обоснованы; неиспользуемые exports/модули удалены; размер baseline-бандла не вырос из-за мертвого кода.

- [x] [INIT]-[092] Удаление дублирования в конфигурации и bootstrap-логике
Task Context: Найди и устрани дублирующиеся константы, scripts, SDK init-пути, повторяющиеся типы и шаблонный код.
Task DOD: Повторяющиеся фрагменты сведены к единым shared-модулям; нет конфликтующих конфигов; архитектурная читаемость улучшена без изменения поведения.

- [x] [INIT]-[093] Анализ безопасности этапа инициализации
Task Context: Проверь bootstrap-поверхность: загрузка SDK, обработка platform lifecycle событий, fallback при недоступности SDK, отсутствие секретов в клиенте.
Task DOD: Зафиксирован краткий security checklist для init-слоя; устранены обнаруженные high-risk issues; в коде нет hardcoded secrets.

- [x] [INIT]-[094] Приведение кода этапа к единому стандарту
Task Context: Приведи init-код к единым стилевым и архитектурным соглашениям: нейминг, структура файлов, комментарии только по сути, форматирование.
Task DOD: `lint/format/typecheck` green; init-модули консистентны по стилю; документация синхронизирована с реальным кодом.

## Этап 2: Модель данных

- [x] [DATA]-[001] Описать и реализовать доменные сущности состояния игры
Task Context: Реализуй типы `GameState`, `LevelSession`, `HelpWindow`, `PendingOperation`, `LeaderboardSyncState`, `WordEntry` строго по TECHSPEC; учти `schemaVersion/stateVersion/updatedAt` и all-time модель очков.
Task DOD: Все сущности представлены типами и runtime-конструкторами; сериализация/десериализация сохраняет структуру без потерь; схема отражена в документации.

- [x] [DATA]-[002] Закрепить инварианты и валидаторы состояния
Task Context: Реализуй runtime-валидацию инвариантов: grid 5x5, только кириллица и отдельная `ё`, target count 3..7, отсутствие дублей, непересечение found sets, однонаправленные level state transitions.
Task DOD: Попытки создать невалидное состояние отклоняются с доменной ошибкой; есть набор unit-тестов на каждое критичное правило инварианта.

- [x] [DATA]-[003] Построить pipeline словаря из `data/dictionary.csv` (normalization + filtering)
Task Context: Реализуй загрузку CSV и нормализацию словаря согласно PRD: lower-case, только кириллица, `ё != е`, без дефисов/пробелов/спецсимволов, только `type=noun`; невалидные строки игнорируй.
Task DOD: Pipeline генерирует валидный in-memory индекс слов; статистика отбракованных строк доступна в telemetry/log; lookup работает O(1) по normalized word.

- [x] [DATA]-[004] Реализовать snapshot schema-versioning, миграции и LWW conflict resolver
Task Context: Добавь `schemaVersion`-ориентированную deterministic migration chain `vN -> vN+1`; реализуй merge local/cloud по правилам LWW (`stateVersion`, затем `updatedAt`, затем local priority при равенстве).
Task DOD: Восстановление состояния воспроизводимо и детерминировано; миграции покрыты тестами; конфликт local/cloud решается строго по контракту TECHSPEC.

- [x] [DATA]-[005] Формализовать контракты событий и correlationId для наблюдаемости
Task Context: Определи event envelope `{ eventId, eventType, eventVersion, occurredAt, correlationId, payload }` и минимальные domain events для word success, level clear, help, persistence, leaderboard sync.
Task DOD: Все ключевые операции публикуют типизированные события; correlationId проходит через цепочку operation end-to-end; схема событий документирована.

- [x] [DATA]-[190] Приборка этапа модели данных
Task Context: Удали временные data-fixtures, отладочные dump-файлы, промежуточные миграционные черновики и неиспользуемые CSV-утилиты.
Task DOD: В репозитории остаются только рабочие модели, миграции и актуальные тестовые фикстуры; нет “одноразовых” артефактов.

- [x] [DATA]-[191] Удаление ненужных структур и полей данных
Task Context: Проведи ревизию схемы и выбрось поля, не требуемые PRD v1 (например, session score, achievements, daily quests, tutorial traces и т.п.).
Task DOD: Модель данных строго соответствует v1 scope; лишние поля удалены из типов, сериализации и тестов.

- [x] [DATA]-[192] Удаление дублирования схем, DTO и валидаторов
Task Context: Устрани повтор типизаций между domain/entity/dto слоями; вынеси общие validator helpers, чтобы не дублировать правила кириллицы/`ё`/length/rank.
Task DOD: Каждое правило валидации определено в одном месте; повторяющиеся DTO-описания консолидированы; coverage тестов не снижен.

- [x] [DATA]-[193] Анализ безопасности модели данных
Task Context: Проверь устойчивость к поврежденным snapshot/CSV/SDK payload: защита от malformed input, overflow счетчиков, неконсистентных переходов состояния.
Task DOD: Добавлены guard-проверки на критичных границах данных; небезопасные кейсы приводят к controlled domain errors без падения приложения.

- [x] [DATA]-[194] Приведение data-слоя к production-quality
Task Context: Приведи именование сущностей, комментарии, миграционные утилиты и документацию к единому стилю; убери “магические числа” в константы.
Task DOD: Data-layer проходит lint/typecheck/tests; документация отражает фактические структуры и версии схемы.

## Этап 3: Кодирование

- [x] [CODE]-[001] Реализовать LevelGenerator (word-first, 5x5, anti-repeat, rejection rules)
Task Context: Собери генератор уровней: выбор target-набора 3..7 слов по длине/rank, укладка путями по 8 направлениям с пересечениями, заполнение пустых клеток, fallback-ретраи без полного сброса набора, anti-repeat по недавним уровням и rejection редких букв.
Task DOD: Каждый сгенерированный уровень валиден по инвариантам; минимум один длинный target присутствует; генератор детерминирован при фиксированном seed.

- [x] [CODE]-[002] Реализовать InputPath для swipe-драг ввода и tail-undo
Task Context: Реализуй обработку drag-path: только соседние клетки (8 направлений), запрет повторного использования клетки, undo только по последней клетке, невалидные/повторные клетки мягко игнорируются.
Task DOD: Path engine корректно строит/сворачивает путь без штрафов; submit происходит по отпусканию пальца; tap-by-tap отсутствует.

- [x] [CODE]-[003] Реализовать WordValidation и apply-логику target/bonus/repeat
Task Context: По submit-path собирай слово, нормализуй и проверяй словарь; различай target, bonus, repeat, invalid; повторы в рамках уровня полностью silent ignore без UI/анимации.
Task DOD: Результат валидации всегда однозначен; повторно найденные слова не меняют state/score; `ё` и `е` обрабатываются как разные буквы.

- [x] [CODE]-[004] Реализовать CoreState scoring/progression в state-first порядке
Task Context: Имплементируй формулы очков PRD (`target: 10+2*len`, `bonus: 2+len`, `level clear: 30+5*N`), idempotency начислений и прогресс `x/N`; любое начисление фиксируется в state до анимаций.
Task DOD: Очки начисляются ровно один раз на событие; бонусы не начисляются после completion; state-first контракт соблюдается во всех submit сценариях.

- [x] [CODE]-[005] Реализовать completion pipeline и автопереход уровня
Task Context: Для последнего target слова соблюдай порядок: commit score -> success animation event -> progress N/N -> ephemeral congrats -> level clear score -> full lock -> auto-next level.
Task DOD: Level clear начисляется ровно один раз; во время перехода ввод заблокирован; после перехода стартует новый `active` уровень без потери all-time score.

- [x] [CODE]-[006] Реализовать HelpEconomy: free-window 5 минут, hint progression, manual reshuffle
Task Context: Реализуй общий пул free-action (`hint`/`reshuffle`) с real-time таймером и shared lock на две кнопки; hint раскрывает 2/3/4+ букв одного слова (самое легкое оставшееся), reshuffle полностью сбрасывает текущий уровень.
Task DOD: Бесплатное действие списывается только после успешного применения помощи; при закрытии вкладки таймер корректно восстанавливается; операции помощи re-entrant-safe.

- [ ] [CODE]-[007] Интегрировать Rewarded Ads outcomes в help flows
Task Context: Добавь вызов `showRewardedVideo` и корректную обработку `reward/close/error/no-fill`: выдача помощи только при reward, toast при no-fill/error, временный cooldown кнопок 2-5 сек, lock обеих кнопок на время операции.
Task DOD: Ни один ad outcome не приводит к двойному применению help; ad-fail не ломает игровой state; telemetry фиксирует outcome и длительность.

- [ ] [CODE]-[008] Реализовать RenderMotion и one-screen UI без лишних сущностей
Task Context: Реализуй liquid/pseudo-liquid feedback: in-drag линия, undo-визуал, success glow (green target / yellow bonus), перелет букв в progress/score; собери UI одного экрана (grid, progress x/N, all-time score, hint, reshuffle, leaderboard) без session score/list/tutorial.
Task DOD: Весь UI соответствует PRD one-screen contract; анимации запускаются по domain events, а не как источник истины; на малых экранах поле 5x5 остается приоритетным элементом.

- [ ] [CODE]-[009] Реализовать PlatformYandex, Persistence, Restore и Leaderboard end-to-end
Task Context: Имплементируй адаптеры `safeStorage + player data/stats` с best-effort restore текущего уровня, гарантией сохранности all-time score и free-action timer; добавь sync leaderboard (`setScore`) для авторизованных пользователей и auth-диалог по явному действию.
Task DOD: На рестарте восстанавливаются score/timer и по возможности уровень; при невозможности level restore создается новый уровень без потери прогресса; leaderboard sync имеет retry/backoff и не блокирует gameplay.

- [ ] [CODE]-[290] Приборка этапа кодирования
Task Context: Удали временные моки, debug UI, тестовые кнопки, неиспользуемые ассеты и экспериментальные рендер-фичи, добавленные в процессе разработки.
Task DOD: В production-сборке отсутствуют debug-only элементы; кодовая база содержит только целевой v1 функционал.

- [ ] [CODE]-[291] Удаление ненужных реализаций вне v1 scope
Task Context: Проверь и удаляй код, который заходит в cut-list PRD (sfx, achievements, desktop layout, adaptive difficulty, seasons и т.п.).
Task DOD: Репозиторий не содержит функционала вне утвержденного v1 scope; зависимости и конфиги синхронизированы с этим ограничением.

- [ ] [CODE]-[292] Удаление дублирования логики в domain/application/ui
Task Context: Найди дубли в scoring, word classification, help locking, timer math, SDK вызовах и унифицируй через shared services/utilities.
Task DOD: Каждая критичная бизнес-формула определена в одном модуле; дублированные ветки кода удалены; регрессий поведения нет.

- [ ] [CODE]-[293] Анализ безопасности реализованного gameplay-кода
Task Context: Проведи security-review client logic: tampering через повторные команды, race conditions help/ad, некорректные payload от SDK/storage, защита от некорректных path submissions.
Task DOD: Выявленные уязвимости закрыты или формально задокументированы как non-goal v1; high-risk issues отсутствуют.

- [ ] [CODE]-[294] Приведение игрового кода в порядок перед тестовым этапом
Task Context: Проведи финальную инженерную чистку: naming consistency, удаление мертвого кода, минимизация сложных функций, обновление модульной документации.
Task DOD: Код читабелен и поддерживаем; `lint/typecheck/build` green; архитектурные границы не нарушены.

## Этап 4: Тесты

- [ ] [TEST]-[001] Unit-тесты CoreState/InputPath/WordValidation на доменные контракты
Task Context: Покрой тестами scoring formulas, state transitions, idempotency, repeat ignore, adjacency/undo rules, dictionary normalization и `ё`-кейсы.
Task DOD: Критичные доменные правила имеют unit coverage; ключевые edge cases из PRD/TECHSPEC зафиксированы тестами и проходят стабильно.

- [ ] [TEST]-[002] Property-based и deterministic тесты LevelGenerator
Task Context: Добавь генераторные проверки: валидность путей, диапазон target count, присутствие длинного слова, anti-repeat в окне недавних уровней, rejection редких букв и стабильность по seed.
Task DOD: Генератор проходит deterministic suite без flaky; property-checks подтверждают соблюдение инвариантов на большом числе итераций.

- [ ] [TEST]-[003] Интеграционные тесты HelpEconomy + Ads + shared lock
Task Context: Проверь E2E внутри приложения сценарии free-now/ad-required/no-fill/error/early-close, блокировку обеих help-кнопок, cooldown и корректность списания free action.
Task DOD: Нет двойного применения help; все ad outcomes приводят к ожидаемым последствиям по контракту; re-entrancy дефекты не воспроизводятся.

- [ ] [TEST]-[004] Интеграционные тесты Persistence/Restore/Leaderboard sync
Task Context: Протестируй safeStorage/player mirror, LWW merge, fallback на новый уровень при проблемах restore, retry/backoff leaderboard sync и стабильность all-time score.
Task DOD: Restore contract `score+timer` выдержан; loss of all-time score не воспроизводится; sync leaderboard не ломает игровой поток.

- [ ] [TEST]-[005] Playwright smoke E2E для критических пользовательских потоков
Task Context: Собери браузерные smoke сценарии: launch, submit target/bonus, level clear auto-next, hint/reshuffle, ad outcome handling, resume after reload; запуск через dev-proxy окружение.
Task DOD: Все критичные E2E сценарии проходят; скриншоты/логи/консоль фиксируют отсутствие критичных runtime ошибок.

- [ ] [TEST]-[006] NFR и release gates: perf/reliability/CI acceptance
Task Context: Введи проверки порогов TECHSPEC: frame-time p95/p99, input latency, restore success, ad error-rate guardrails; подключи их в CI gates до `Yandex draft`.
Task DOD: CI блокирует релиз при нарушении порогов; acceptance-отчет показывает соответствие system-level критериям перед production.

- [ ] [TEST]-[007] Стабилизировать Playwright smoke в TLS-контуре dev-proxy
Task Context: Устрани нестабильность smoke-прогона в `sdk-dev-proxy` из-за self-signed сертификата (`ERR_CERT_AUTHORITY_INVALID`); зафиксируй поддерживаемый и воспроизводимый способ запуска `web_game_playwright_client` без временных SDK-моков.
Task DOD: Playwright smoke в proxy-контуре запускается локально и в CI без ручного обхода TLS-ошибок; README содержит актуальные инструкции и ограничения.

- [ ] [TEST]-[390] Приборка этапа тестирования
Task Context: Удали временные тестовые артефакты, устаревшие snapshots, лишние фикстуры и экспериментальные сценарии, не несущие value.
Task DOD: Тестовый набор компактный и актуальный; неиспользуемые тестовые файлы удалены.

- [ ] [TEST]-[391] Удаление ненужных тестов и устаревших проверок
Task Context: Проведи ревизию тестов на предмет дублирования и проверки неактуального поведения; исключи тесты на функционал вне v1 scope.
Task DOD: Каждый тест проверяет релевантный контракт v1; ложноположительные/устаревшие тесты удалены.

- [ ] [TEST]-[392] Удаление дублирования тест-кейсов и хелперов
Task Context: Консолидируй повторяющиеся setup-последовательности, mocks SDK и helper-функции для state factory.
Task DOD: Тестовые хелперы переиспользуются централизованно; объем дублирующего тест-кода заметно снижен без потери покрытия.

- [ ] [TEST]-[393] Анализ безопасности тестового контура
Task Context: Убедись, что тесты покрывают security-sensitive paths: malformed input, race conditions, idempotency abuse, no-secrets policy, telemetry PII deny-list.
Task DOD: Security-критичные сценарии включены в автоматические тесты; найденные пробелы закрыты дополнительными кейсами.

- [ ] [TEST]-[394] Приведение тестового контура к стабильному состоянию
Task Context: Оптимизируй время и стабильность тестов, устрани flaky-кейсы, синхронизируй именование и структуру test suites с модулями проекта.
Task DOD: Тестовый прогон воспроизводим; flaky-tests устранены; test-report удобен для анализа перед релизом.

## Этап 5: Безопасность

- [ ] [SEC]-[001] Провести threat modeling для клиентской архитектуры v1
Task Context: Сформируй модель угроз для client-only игры в Yandex runtime: tampering score/help flows, replay команд, corrupted snapshots, SDK callback misuse, ad abuse, leaderboard misuse.
Task DOD: Подготовлен threat model с приоритизацией рисков и контрмерами; все P0/P1 риски имеют реализацию или формальное accepted risk-решение.

- [ ] [SEC]-[002] Усилить валидацию входов на всех trust-boundaries
Task Context: Добавь строгую валидацию и безопасные дефолты для path input, dictionary CSV, storage payloads, SDK callbacks, restore data; запрещай небезопасные состояния до входа в domain.
Task DOD: Некорректные входы не приводят к падению/коррупции состояния; ошибки классифицируются как domain/infra и логируются структурированно.

- [ ] [SEC]-[003] Закрыть anti-abuse: idempotency, re-entrancy, tamper-evident telemetry
Task Context: Проверь и закрой возможности повторного начисления очков/помощи через race/retry/replay; добавь корреляцию операций и telemetry-сигналы аномалий.
Task DOD: Критичные операции “ровно один раз” защищены технически; повторный вызов не изменяет state сверх контракта; аномалии детектируются по метрикам.

- [ ] [SEC]-[004] Обеспечить privacy/no-secrets и безопасность supply chain
Task Context: Проведи аудит на отсутствие секретов в клиенте, добавь secret scanning и dependency vulnerability/license checks в CI; в telemetry исключи PII.
Task DOD: CI падает при обнаружении секретов/критичных уязвимостей; telemetry schema проходит PII deny-list review.

- [ ] [SEC]-[005] Выполнить release security verification перед production
Task Context: Собери финальный security checklist релиза: hardening конфигов, audit логов ошибок, проверка rollback readiness, документирование residual risks v1.
Task DOD: Security sign-off зафиксирован; критичных незакрытых уязвимостей нет; release-пакет готов к moderation/production.

- [ ] [SEC]-[490] Приборка security-этапа
Task Context: Удали временные security-скрипты, одноразовые отчеты и локальные debug-настройки, не предназначенные для постоянного хранения.
Task DOD: В репозитории остаются только поддерживаемые security-инструменты и актуальные артефакты.

- [ ] [SEC]-[491] Удаление ненужных security-исключений и bypass-правил
Task Context: Пересмотри временные allowlist/ignore правила в сканерах и линтерах безопасности; оставь только обоснованные и задокументированные исключения.
Task DOD: Необоснованные bypass-правила удалены; остаточные исключения минимальны и имеют явную причину.

- [ ] [SEC]-[492] Удаление дублирования security-политик и проверок
Task Context: Консолидируй повторяющиеся security-check scripts, policy документы и pipeline шаги, чтобы не было расхождений между локальной и CI-проверкой.
Task DOD: Security-проверки определены единообразно; локальный и CI контуры дают эквивалентный результат.

- [ ] [SEC]-[493] Финальный анализ безопасности и residual risks review
Task Context: Проведи финальный проход по рискам PRD/TECHSPEC (render complexity, restore variability, grind leaderboard fairness) и закрепи, что остается осознанным non-goal v1.
Task DOD: Подготовлен краткий residual risk register; статус каждого риска прозрачен для релизного решения.

- [ ] [SEC]-[494] Приведение security-документации и кода в порядок
Task Context: Синхронизируй security-гайды, runbooks и inline-пояснения с фактической реализацией; убери устаревшие секции и неиспользуемые политики.
Task DOD: Документация и код согласованы; команда может воспроизводимо выполнить security-процедуры без дополнительных уточнений.
