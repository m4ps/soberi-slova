# ADR-030: Rewarded Ads outcomes, cooldown и event-driven orchestration

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [CODE]-[007]

## Контекст

Для `[CODE]-[007]` требовалось довести help-flow до рабочего контракта rewarded ads:

1. запуск `showRewardedVideo` для ad-required help-операций,
2. корректная обработка `reward/close/error/no-fill`,
3. гарантия отсутствия двойного применения help при множественных ad callbacks,
4. временная блокировка help-кнопок после no-reward исходов,
5. observability outcome + duration для telemetry.

До изменения ad-result подтверждался только вручную командой `AcknowledgeAdResult`, а `PlatformYandex` не оркестрировал rewarded flow.

## Решение

1. Ввести event-driven ad orchestration в `PlatformYandex`:
   - подписка на `domain/help` события `phase=requested` + `requiresAd=true`,
   - вызов `ysdk.adv.showRewardedVideo` и трансляция callback outcomes в `AcknowledgeAdResult`.

2. Зафиксировать single-dispatch гарантию для одной ad-операции:
   - локальный guard `resolved` в rewarded-flow адаптера,
   - повторные callbacks (`onClose` после `onRewarded`) не приводят к повторному ack.

3. Зафиксировать cooldown политику в `HelpEconomy`:
   - `HELP_AD_FAILURE_COOLDOWN_MS = 3000`,
   - cooldown включается только для ad-required no-reward исходов (`close/error/no-fill`),
   - `requestHelp` в период cooldown возвращает решение `cooldown` с remaining time/reason.

4. Расширить observability payload для `domain/help` (`phase=ad-result`):
   - `durationMs` (время ad-flow),
   - `outcomeContext` (технический reason при error/no-fill),
   - `cooldownApplied`, `cooldownDurationMs`,
   - `toastMessage` (UI-сигнал для no-reward исходов).

## Последствия

- Rewarded Ads интегрированы без нарушения state-first контракта: применение help остаётся в `Application/CoreState`.
- Повторные ad callbacks не вызывают double-apply help.
- Help UX после no-reward outcomes стабилизирован через deterministic cooldown.
- Telemetry получила достаточный контекст для анализа ad-fail/no-fill и длительности ad-flow.
