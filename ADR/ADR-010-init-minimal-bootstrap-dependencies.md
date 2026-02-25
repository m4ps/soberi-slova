# ADR-010: Минимизация bootstrap-зависимостей Application на этапе INIT

- Статус: accepted
- Дата: 2026-02-24
- Связанные задачи: [INIT]-[091]

## Контекст

В init-реализации `Application` требовал `WordValidation` и `LevelGenerator` в `DomainModules`,
хотя текущие command/query handlers их не использовали. Это добавляло лишний wiring в `main.ts`
и включало неиспользуемый код в entry-контур без функциональной ценности для текущего этапа.

## Решение

1. Удалить `wordValidation` и `levelGenerator` из обязательных зависимостей `DomainModules`
   в `src/application/contracts.ts`.
2. Сократить bootstrap wiring в `src/main.ts`, исключив создание и передачу неиспользуемых
   модулей в `createApplicationLayer`.
3. Оставить сами доменные модули `WordValidation` и `LevelGenerator` в проекте как подготовленные
   public interfaces для следующих этапов backlog (DATA/CODE), без удаления их исходников.

## Последствия

- Application-контракт отражает только реально используемые зависимости текущего init-слоя.
- Уменьшен объём мёртвого кода в bootstrap/entry цепочке.
- Будущие задачи, где `WordValidation`/`LevelGenerator` начнут участвовать в use-cases, смогут
  повторно расширить `DomainModules` осознанно и в рамках целевого scope.
