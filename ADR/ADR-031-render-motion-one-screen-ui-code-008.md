# ADR-031: RenderMotion one-screen UI и event-driven submit animations

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [CODE]-[008]

## Контекст

Для `[CODE]-[008]` требовалось довести визуальный слой до продуктового one-screen контракта PRD:

1. всегда видимый UI (`grid 5x5`, `progress x/N`, `all-time score`, `hint`, `reshuffle`, `leaderboard`);
2. pseudo-liquid feedback для drag-path и tail-undo;
3. success feedback (glow + перелёт букв в HUD) для `target/bonus`;
4. запуск визуальных эффектов от доменных событий, а не от прямых мутаций UI;
5. сохранение state-first принципа: рендер не становится источником истины.

До изменения `RenderMotion` отрисовывал только фон, без игрового UI и без визуальных реакций на gameplay-события.

## Решение

1. Переписать `RenderMotion` в полноценный one-screen рендер-адаптер:
   - layout рассчитывается через единый helper `computeGameLayout`;
   - отрисовываются grid/HUD/control-кнопки в одном canvas-контуре;
   - приоритет площади поля `5x5` сохраняется на малых экранах.

2. Ввести доменное событие `domain/word-submitted` в application-слое:
   - payload содержит `result`, `scoreDelta`, `progress`, `pathCells`, `wordSuccessOperationId`;
   - визуальные success-анимации в `RenderMotion` стартуют по этому событию, а не по прямому polling diff.

3. Реализовать event-driven motion pipeline в `RenderMotion`:
   - in-drag trail + undo pulse на основе path snapshot из `InputPath`;
   - success glow (green/yellow) и перелёт букв в progress/score;
   - автоматический completion ack (`AcknowledgeWordSuccessAnimation`, `AcknowledgeLevelTransitionDone`) через отложенные jobs в рендер-цикле.

4. Синхронизировать `InputPath` с layout:
   - path input принимается только в пределах grid-области;
   - `InputPath` публикует path snapshots для визуального feedback в `RenderMotion`.

## Последствия

- UI соответствует one-screen контракту PRD без добавления out-of-scope сущностей (session score/tutorial/list).
- Анимации submit-flow привязаны к доменным событиям (`domain/word-submitted`), что сохраняет state-first модель.
- Completion pipeline работает end-to-end в runtime без ручных acknowledge-команд извне.
- Логика layout и input-path больше не дублируется между `RenderMotion` и `InputPath`.
