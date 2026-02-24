# ADR-008: Инженерный baseline quality gates для INIT-005

- Статус: accepted
- Дата: 2026-02-24
- Связанные задачи: [INIT]-[005]

## Контекст

На этапе инициализации отсутствовал единый baseline инженерных проверок для pre-merge цикла:
не было формализованных `lint/format` команд и CI workflow с обязательной последовательностью
проверок, согласованной с TECHSPEC gates.

## Решение

1. Зафиксировать обязательный baseline pipeline:
   `typecheck -> test -> lint -> format:check -> build`.
2. Использовать:
   - `ESLint` (flat config) для lint-проверок TypeScript-кода;
   - `Prettier` для единого форматирования baseline-файлов;
   - `GitHub Actions` workflow `.github/workflows/ci.yml` как pre-merge gate.
3. Развести зоны ответственности этапов:
   - в `INIT-005` включить только baseline gates;
   - `integration/deterministic generator/Playwright/bundle-size` добавить отдельными задачами
     следующих этапов (по текущему backlog).

## Последствия

- Проект получил воспроизводимый локальный и CI baseline-контур качества.
- Проверки запускаются одной командой `npm run ci:baseline`.
- Pre-merge процесс документирован и синхронизирован с техническими ограничениями текущего этапа.
