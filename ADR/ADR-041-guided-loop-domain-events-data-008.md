# ADR-041: Семантические доменные события guided loop и hint progression

- Статус: accepted
- Дата: 2026-03-08
- Связанные задачи: [DATA]-[008]

## Контекст

После `DATA-005` проект уже имел единый event envelope и сквозной `correlationId`, но доменные события оставались слишком агрегированными:

- `domain/word-submitted` смешивал target, bonus, repeat и invalid submit;
- `domain/help` одновременно использовался и как transport-сигнал для rewarded ads, и как результат help-операции;
- persistence не публиковал отдельное событие о фактической записи snapshot.

Для guided loop `v1.1` этого стало недостаточно: telemetry, render и persistence должны различать принятие target/bonus-слов, смену displayed target, прогресс hint-пути, завершение уровня и фактический persist без ad-hoc разбора общих payload'ов.

## Решение

1. Расширить `ApplicationEvent` семантическими versioned event-types:
   - `domain/target-word-accepted`;
   - `domain/bonus-word-accepted`;
   - `domain/displayed-target-changed`;
   - `domain/hint-path-progress-advanced`;
   - `domain/level-completed`;
   - `domain/help-action-applied`;
   - `domain/help-action-failed`;
   - `domain/state-persisted`.
2. Сохранить единый envelope из `ADR-018` без изменений:
   - обязательные `eventId`, `eventType`, `eventVersion`, `occurredAt`, `correlationId`, `payload`;
   - `eventVersion = 1` для нового набора событий.
3. Публиковать события максимально близко к business transition:
   - application-layer публикует события принятия слов, смены guided target, hint progression, level completion и outcomes help-операций;
   - persistence-адаптер публикует `domain/state-persisted` только после успешной записи snapshot и использует `correlationId` события-триггера.
4. Сохранить существующие transport-события там, где они ещё нужны текущему пайплайну:
   - `domain/help` остаётся сигналом для старта rewarded ad flow;
   - `domain/word-success`, `domain/level-clear`, `domain/persistence`, `domain/leaderboard-sync` продолжают обслуживать animation/persistence/platform acknowledgements.

## Последствия

- Render/persistence/telemetry получают точные события без необходимости декодировать фазу из общих payload'ов.
- `correlationId` остаётся сквозным на всём пути `command -> domain events -> persistence`.
- Persistence становится наблюдаемым: теперь можно отличать сам триггер flush от факта успешной записи snapshot.
- Миграция event-модели выполнена без разрыва текущих rewarded-ad и transition пайплайнов.
