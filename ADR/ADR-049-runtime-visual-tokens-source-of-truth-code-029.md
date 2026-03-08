# ADR-049: Runtime читает visual contract только из VisualSystem

- Статус: accepted
- Дата: 2026-03-08
- Связанная задача: [CODE]-[029]

## Контекст

`ADR-043` ввёл `VisualSystem` как отдельный adapter-модуль и зафиксировал его как
архитектурный baseline. Однако реальный runtime оставался на промежуточном
состоянии: `RenderMotion` продолжал хранить локальные цвета и motion timings,
progress bar отсутствовал как полноценный visual component, а shell/fallback UI
жили на собственной тёмной палитре вне `visualTokens`.

Это нарушало `TECHSPEC.md` и `DESIGN.md`, где visual tokens, button states,
progress bar и current-word transition объявлены обязательной частью runtime
contract, а не поздней polishing-итерацией.

## Решение

1. Считать `visualTokens` единственным источником visual contract для runtime:
   - shell/background/root container;
   - glass panels верхней строки, current-word блока, grid и controls;
   - grid/path/hint/toast colors;
   - progress bar fill/pulse contract;
   - current-word transition contract;
   - button state contracts и их timings.
2. Расширить `GameLayout` в `VisualSystem` до фактической screen hierarchy из
   `DESIGN.md`:
   - `metricsRow`;
   - `progressCard`;
   - `scoreCard`;
   - `currentWord`;
   - `progressBar`.
3. Перевести `RenderMotion` на чтение visual-решений только из `VisualSystem`:
   - убрать локальные hex/timing constants;
   - анимировать progress fill и current-word transition по token rules;
   - button hover/focus/pressed/disabled вычислять из shared contract.
4. Перевести DOM-shell и bootstrap fail state на те же токены через CSS custom
   properties и inline application of `visualTokens`.

## Последствия

- Изменение визуального поведения теперь проходит через `VisualSystem`, а не
  через ad hoc правки в `RenderMotion` или `style.css`.
- Расхождения с `DESIGN.md` локализуются в одном visual contract и становятся
  reviewable как осознанное изменение токенов.
- Runtime и shell используют одну светлую visual language, поэтому fallback UI
  не выпадает из общей арт-дирекции.
- Контракт усиливается тестами на layout/tokens/runtime helpers, что снижает
  риск возврата локальных цветов и motion timings в adapter-код.
