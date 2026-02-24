# [INIT]-[001] Bootstrap проекта (TypeScript + PixiJS v8 + Yandex Games runtime)

## Что сделано

- Поднят проектный каркас для web-игры: `src/`, `assets/`, `tests/`.
- Подключён PixiJS v8 и реализована стартовая точка входа `src/main.ts`.
- Реализован пустой игровой экран в portrait-only формате (single-screen, single-canvas).
- Добавлены вспомогательные runtime-hooks для автоматизированной проверки рендера:
  - `window.render_game_to_text`
  - `window.advanceTime(ms)`
- Добавлены скрипты и инструменты в `package.json`: `dev/build/preview/typecheck/test`.
- Добавлен smoke unit test на инвариант viewport (`tests/bootstrap.test.ts`).
- Подготовлен README с зафиксированной структурой директорий и командами запуска.

## Верификация

- `npm run test` — passed
- `npm run build` — passed
- Playwright smoke через `$WEB_GAME_CLIENT` — passed (стабильные скриншоты + без `errors-*.json`)

## Принятые решения

- [ADR-004: Bootstrap toolchain для INIT-001](../ADR/ADR-004-init-bootstrap-toolchain.md)
