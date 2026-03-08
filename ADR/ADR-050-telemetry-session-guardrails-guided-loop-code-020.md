# ADR-050: CODE-020 — session telemetry и product guardrails для guided loop v1.1

## Статус

Принято, 2026-03-09.

## Контекст

`TECHSPEC.md` и `PRD.md` для `v1.1` уже фиксируют обязательные post-launch сигналы:

- product: `session length`, `D1`, `help-action share`, `mean time to find displayed target`;
- technical: `restore success`, `ad outcomes`, `leaderboard sync success`, `error-rate by code`.

На момент начала `CODE-020` runtime имел только raw application/domain events и platform lifecycle log:

- `Telemetry` adapter складывал в буфер весь event bus без агрегатов;
- restore/leaderboard outcomes не были доступны как typed observability contract;
- failure telemetry не имела отдельного typed события по `error.code`;
- для D1 отсутствовала локальная anonymous install identity.

Это мешало проверить pacing/scoring гипотезы после релиза без нового клиентского instrumentation.

## Решение

1. Оставить существующий event envelope базой observability и не вводить отдельный analytics SDK.
2. Расширить typed event-contract:
   - добавить `application/command-failed` для `error-rate by code`;
   - обогатить `domain/persistence` restore outcome-метаданными;
   - добавить `platform/leaderboard-sync-result` с сохранением trigger `correlationId`.
3. Собирать session telemetry в `Telemetry` adapter как derived typed records:
   - `telemetry/session-started`;
   - `telemetry/session-summary`;
   - `telemetry/guardrail-snapshot`.
4. Для retention использовать только локально хранимый anonymous install state:
   - `installId`;
   - `firstSeenDayNumber`;
   - `lastSeenDayNumber`;
   - `sessionCount`.
5. Guardrails считать на клиенте как status `ok | monitor | alert | insufficient-data`, но без product-side hard blocking:
   - help-action share;
   - mean displayed-target find time;
   - restore success rate;
   - ad failure rate;
   - leaderboard sync success rate;
   - error rate by code.

## Последствия

- Post-launch анализ pacing/scoring можно делать по уже доступным typed logs без дописывания клиента.
- D1 становится вычислимым без PII за счёт anonymous install identity.
- Restore и leaderboard transport outcomes больше не прячутся в adapter-local логах.
- Telemetry остаётся внутри layered architecture: adapters публикуют typed events, а derived session summary строится отдельным adapter-модулем.
- Thresholds guardrails остаются operational heuristics и могут меняться без изменения event schema.
