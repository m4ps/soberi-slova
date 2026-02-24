# [INIT]-[005] Настроить инженерный baseline (lint/typecheck/build/format)

## Что сделано

- В `package.json` добавлены baseline-скрипты:
  - `lint`, `lint:fix`;
  - `format`, `format:check`;
  - `ci:baseline` (последовательность pre-merge проверок).
- Добавлен `eslint.config.mjs` (flat-конфиг для TypeScript):
  - базовые recommended-правила;
  - правило `@typescript-eslint/consistent-type-imports`;
  - исключения для `dist/`, `node_modules/`, `output/`.
- Добавлены Prettier-конфиги:
  - `.prettierrc.json`;
  - `.prettierignore`.
- Добавлен CI workflow `.github/workflows/ci.yml`:
  - `npm ci`;
  - `typecheck -> test -> lint -> format:check -> build`.
- Обновлён `README.md`:
  - список новых инженерных команд;
  - раздел обязательного pre-merge pipeline.

## Верификация

- `npm run lint` — passed
- `npm run format:check` — passed
- `npm run typecheck` — passed
- `npm run test` — passed
- `npm run build` — passed
- `npm run ci:baseline` — passed
- Playwright smoke через `develop-web-game` client + `sdk-dev-proxy` — passed:
  - скриншоты: `output/web-game-init005-baseline/shot-0.png`, `shot-1.png`
  - state snapshots: `output/web-game-init005-baseline/state-0.json`, `state-1.json`
  - console errors: отсутствуют (`errors-*.json` не созданы)

## Принятые решения

- [ADR-008: Инженерный baseline quality gates для INIT-005](../ADR/ADR-008-engineering-baseline-init-005.md)
