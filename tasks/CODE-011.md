# [CODE]-[011] Добавить dev-only панель с целевыми словами уровня

## Что сделано

- UI оставлен без изменений, debug-вывод target-слов перенесён в консоль:
  - в [`src/adapters/RenderMotion/index.ts`](../src/adapters/RenderMotion/index.ts) добавлен dev-only `console.info` с префиксом `[dev][target-words]`;
  - лог содержит `levelId` и список целевых слов со статусом `found`.
- Добавлена дедупликация логирования:
  - лог публикуется только при изменении сигнатуры набора (`levelId + targetWords + foundTargets`), а не каждый кадр.
- Удалены артефакты прежней UI-debug реализации:
  - `src/adapters/RenderMotion/dev-target-panel.ts`;
  - `tests/render-dev-target-panel.test.ts`.
- Обновлены артефакты:
  - `BACKLOG.md` (`[CODE]-[011]` отмечена выполненной);
  - `CHANGELOG.md`;
  - `README.md`.

## Верификация

- `npm run ci:baseline` — passed.
- Playwright smoke (`develop-web-game`) — passed:
  - запуск:
    `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 1 --pause-ms 250 --screenshot-dir output/web-game-code011-console-only`;
  - артефакты: `output/web-game-code011-console-only/shot-0.png`, `state-0.json`;
  - `errors-*.json` отсутствуют;
  - для smoke использован временный `public/sdk.js` mock для `/sdk.js`; после прогона удалён.

## Принятые решения

- [ADR-036: Console-only debug-вывод target-слов без изменений UI](../ADR/ADR-036-dev-target-words-console-only-code-011.md)
