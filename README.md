# Endless Word Grid

Bootstrap проекта под web-игру для Яндекс Игр: TypeScript + PixiJS v8, mobile-first, portrait-only, single-screen.

## Быстрый старт

```bash
npm install
npm run dev
```

Откройте адрес из вывода Vite (по умолчанию `http://localhost:5173`).

## Скрипты

- `npm run dev` — локальный запуск в режиме разработки.
- `npm run build` — typecheck + production build.
- `npm run preview` — локальный preview production-сборки.
- `npm run typecheck` — проверка TypeScript типов.
- `npm run test` — запуск smoke unit tests (Vitest).
- `npm run test:watch` — Vitest в watch-режиме.

## Структура

```text
assets/         Статические ассеты игры
data/           Входные данные (словарь)
src/            Исходный код приложения
  config/       Конфигурация viewport и константы bootstrap
  types/        Глобальные типы браузерного runtime
tests/          Smoke unit tests
ADR/            Архитектурные решения
tasks/          Отчёты по выполненным задачам
```

## Текущий статус INIT-001

- Поднят базовый проект на TypeScript + PixiJS v8 + Vite.
- Реализован пустой экран в портретном viewport (single canvas).
- Добавлены `window.render_game_to_text` и `window.advanceTime(ms)` для автоматизированного тестового цикла.
