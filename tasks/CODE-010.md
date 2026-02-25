# [CODE]-[010] Улучшить диагональный свайп: tolerance к неточному движению

## Что сделано

- Усилен `InputPath` в [`src/adapters/InputPath/index.ts`](../src/adapters/InputPath/index.ts):
  - добавлены directional snapping и угловая толерантность для выбора диагонального соседа;
  - добавлен hysteresis между соседними sample-точками движения;
  - добавлена интерполяция между pointer-событиями для устойчивого прохождения промежуточных клеток;
  - добавлен guard согласованности шага с реальным вектором движения pointer, чтобы убрать ложные осевые отклонения после диагонального snap.
- Расширен `tests/input-path.adapter.test.ts`:
  - регресс на off-axis диагональный жест (исторический дефект);
  - сценарий sparse pointer-событий с сохранением диагональной цепочки.
- Обновлены артефакты выполнения:
  - `BACKLOG.md` (`[CODE]-[010]` отмечена выполненной);
  - `CHANGELOG.md`;
  - `progress.md`;
  - добавлен `ADR/ADR-035-diagonal-swipe-snapping-code-010.md`.

## Верификация

- `npm run test -- tests/input-path.adapter.test.ts` — passed.
- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск:
    `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-code010-smoke`;
  - артефакты: `output/web-game-code010-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.
  - использован временный `public/sdk.js` mock для `/sdk.js`; после прогона удалён.

## Принятые решения

- [ADR-035: Диагональный swipe через directional snapping + hysteresis + интерполяцию](../ADR/ADR-035-diagonal-swipe-snapping-code-010.md)
