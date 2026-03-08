# ADR-043: VisualSystem как отдельный adapter-модуль архитектуры

- Статус: accepted
- Дата: 2026-03-08
- Связанная задача: [INIT]-[006]

## Контекст

Текущий `TECHSPEC.md` требует отдельный `VisualSystem` модуль для visual tokens,
layout hierarchy и button/motion contracts. Исторический baseline был собран без
такого модуля: layout helper лежал в `shared`, а visual-решения были размазаны
между `RenderMotion` и stylesheet.

Нужно ввести `VisualSystem`, не нарушая strict layered model и не протаскивая
visual-зависимости в `domain` или `application`.

## Решение

1. Ввести `src/adapters/VisualSystem` как отдельный adapter-модуль с публичным
   API:
   - `createVisualSystemModule()`;
   - `computeGameLayout(...)`;
   - `VISUAL_LAYOUT_HIERARCHY`;
   - `visualTokens`;
   - `visualButtonStateContracts`.
2. Зафиксировать `VisualSystem` в adapter-слое:
   - `domain` и `application` не импортируют visual-контракты;
   - runtime зависит от `VisualSystem` только через публичный adapter API;
   - import-граф продолжает контролироваться существующим layered test.
3. Перевести текущих потребителей layout/button-contracts на новый модуль:
   - `RenderMotion` получает layout и button state из `VisualSystem`;
   - `InputPath` использует `VisualSystem` как источник grid layout bounds.
4. Считать это архитектурным baseline-слоем:
   - модуль уже является source of truth для контрактов;
   - полная runtime-адаптация всех visual tokens остаётся отдельной задачей
     развития UI, а не частью этой инициализации.

## Последствия

- `VisualSystem` оформлен как самостоятельный архитектурный модуль, а не как
  набор ad hoc helper'ов.
- Layout contract больше не живёт в `shared`, поэтому visual-правила не выглядят
  как нейтральная cross-layer utility.
- `RenderMotion` и `InputPath` используют согласованный visual API, что упрощает
  дальнейшее развитие layout/tokens без расползания visual-логики по коду.
- Границы слоёв остаются строгими: visual-контракты не становятся зависимостью
  доменной или application-логики.
