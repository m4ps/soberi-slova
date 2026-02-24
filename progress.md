Original prompt: Найди первую невыполненную задачу в @BACKLOG.md, выполни её по AGENTS/TECHSPEC/PRD, обнови BACKLOG/CHANGELOG/ADR/tasks, прогони тесты и сделай commit+push.

## 2026-02-24 INIT-001
- Собраны требования из AGENTS.md, BACKLOG.md, TECHSPEC.md и PRD.md.
- Для bootstrap использован стек TypeScript + PixiJS v8 + Vite.
- Создан каркас: src/assets/tests + базовые конфиги и README.
- Исправлен type-safety дефект: root container теперь извлекается через `getRootElement()` без nullable-пути.
- Исправлен детерминированный хук времени: `window.advanceTime` теперь делает безопасный рендер-степ через `app.render()`; фон зафиксирован через `backgroundColor`.
- Для стабильного smoke-рендера добавлен статический stage-backdrop (без геймплейной логики), чтобы canvas всегда содержал однозначный кадр.
- Исправлен артефакт Playwright-снимков: включён `preserveDrawingBuffer` для корректного повторного `toDataURL` захвата WebGL canvas.
- Обновлены проектные артефакты по задаче: BACKLOG (INIT-001 done), CHANGELOG, ADR-004, отчёт tasks/INIT-001.md.
