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
  adapters/     Верхний слой: Input/Render/Platform/Persistence/Telemetry
  application/  Use-case слой и контракты команд/событий
  config/       Конфигурация viewport и shared-константы bootstrap
  domain/       CoreState и доменные модули/правила
  types/        Глобальные типы браузерного runtime
tests/          Smoke unit tests
ADR/            Архитектурные решения
tasks/          Отчёты по выполненным задачам
```

## Архитектура слоёв (INIT-002)

- Базовое правило зависимостей:
  `UI/Input/Render/Platform/Persistence/Telemetry -> Application -> CoreState/Domain`
- Границы модулей защищены автоматическим тестом `tests/architecture-boundaries.test.ts`.

```mermaid
flowchart TD
  ADAPTERS["Adapters: InputPath / RenderMotion / PlatformYandex / Persistence / Telemetry"] --> APP["Application Layer"]
  APP --> DOMAIN["Domain Layer: CoreState / WordValidation / LevelGenerator / HelpEconomy"]
```

Публичные модульные интерфейсы v1 bootstrap-этапа:

- `CoreState` — source of truth для runtime-mode snapshot.
- `InputPath` — adapter ввода (привязка canvas и dispatch в application).
- `WordValidation` — доменная классификация слова (`target|bonus|repeat|invalid`).
- `LevelGenerator` — заготовка генерации уровня (seed/grid contract).
- `HelpEconomy` — контракт окна бесплатной помощи.
- `RenderMotion` — рендер-адаптер Pixi и текстовый scene snapshot.
- `PlatformYandex` — bootstrap-контракт платформенного адаптера (stub до INIT-004).
- `Persistence` — restore/flush контракт snapshot-слоя (stub до DATA/SEC этапов).
- `Telemetry` — сбор application events в буфер адаптера.

## Application Bus Contract (INIT-003)

- Все use-cases application-слоя вызываются через единый typed bus:
  - `commands.dispatch(command)`
  - `queries.execute(query)`
- Обязательные команды v1 реализованы как типы `ApplicationCommand` (см. `src/application/contracts.ts`).
- Результат команд и запросов возвращается в унифицированном envelope:
  - `ok`
  - `domainError`
  - `infraError`
- Формат ошибки единый: `{ code, message, retryable, context }`.

## Текущий статус

- INIT-001: базовый bootstrap завершён.
- INIT-002: добавлена слоистая архитектура и модульные границы.
- INIT-003: добавлен typed command/query bus с envelopes результатов и smoke-тестом маршрутизации.
