# ADR-018: Unified event envelope и сквозной correlationId для observability

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [DATA]-[005]

## Контекст

Для этапа DATA-005 необходимо формализовать контракт внутренних событий и обеспечить сквозную корреляцию операций.

Ограничения TECHSPEC:

- единый event envelope: `{ eventId, eventType, eventVersion, occurredAt, correlationId, payload }`;
- минимальный набор domain events: `word success`, `level clear`, `help`, `persistence`, `leaderboard sync`;
- `correlationId` должен проходить через operation chain end-to-end.

До изменения события имели неоднородную форму (`type/at`), а `correlationId` был опциональным и только у части routed-команд.

## Решение

1. Ввести единый тип `EventEnvelope` в `src/application/contracts.ts` и перевести все `ApplicationEvent` на него.
2. Зафиксировать versioned event-types (в текущей итерации `eventVersion = 1` для всех типов).
3. Добавить обязательный `correlationId`:
   - использовать внешний operation id, если он есть;
   - иначе генерировать внутри application-слоя.
4. Публиковать минимальные domain events для ключевых операций:
   - `domain/word-success` (ack success animation);
   - `domain/level-clear` (ack level transition);
   - `domain/help` (`requested` и `ad-result`);
   - `domain/persistence` (restore session);
   - `domain/leaderboard-sync` (sync score).
5. Возвращать `correlationId` в `CommandAck` для связывания цепочки `dispatch -> events -> telemetry`.

## Последствия

- События теперь имеют стабильный и расширяемый observability-контракт.
- Трассировка операций стала детерминированной: routed-событие и domain-событие используют один и тот же `correlationId`.
- Telemetry-адаптер получает единообразные payload’ы и может агрегировать метрики без ad-hoc парсеров.
- Последующие этапы (`CODE-*`, `SEC-*`) могут безопасно расширять payload/event versions без изменения базовой схемы envelope.
