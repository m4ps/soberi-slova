# ADR-046: Deterministic reject policy для rewarded ad technical error

- Статус: accepted
- Дата: 2026-03-08
- Связанные задачи: PVL-48, [CODE]-[021]

## Контекст

`PRD.md` для `Rewarded Ad Outcomes` оставлял `ad technical error` открытым решением: помощь можно было выдать как goodwill, чтобы не ломать UX.

При этом runtime после `[CODE]-[007]` уже фактически обрабатывал `showRewardedVideo` technical error как один из no-reward исходов:

- `HelpEconomy` включал общий cooldown после `error`;
- `application` публиковал generic toast для `error`;
- telemetry фиксировала сам outcome, но не выбранную policy.

В результате policy была неявной:

- в коде оставались локальные решения про `error` вместо одного контракта;
- `hint` и `reshuffle` зависели от рассыпанных веток `reward/error/no-fill`;
- telemetry не показывала, что именно продукт решил делать при technical error.

## Решение

1. Зафиксировать product policy для `showRewardedVideo` technical error как `deterministic-reject-with-toast-and-cooldown`.
2. Вынести ad outcome policy в единый shared/config contract, который определяет:
   - можно ли применять help для конкретного ad outcome;
   - нужен ли cooldown;
   - какой toast публикуется в UI;
   - какую `technicalErrorPolicy` нужно отправлять в telemetry.
3. Считать `error` тем же product-level no-reward исходом для обоих help flows:
   - goodwill не применяется;
   - help не выдаётся;
   - публикуется toast `Не удалось показать рекламу`;
   - включается общий cooldown help-кнопок на `3 сек`.
4. Прокидывать `technicalErrorPolicy` в telemetry payload для `domain/help` (`phase=ad-result`) и `domain/help-action-failed`.

## Последствия

- `hint` и `reshuffle` используют один и тот же deterministic contract для ad technical error.
- В коде больше нет разрозненных локальных решений goodwill vs reject для `error`.
- Telemetry теперь различает не только `outcome=error`, но и выбранную продуктовую policy.
- Изменение остаётся обратимо через один config contract, если продукт позже решит перейти на deterministic goodwill.
