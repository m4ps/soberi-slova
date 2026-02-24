# ADR-006: Единый command/query bus и result envelope для INIT-003

- Статус: accepted
- Дата: 2026-02-24
- Связанные задачи: [INIT]-[003]

## Контекст

Для следующего этапа реализации нужна единая точка входа в application use-cases с типизированными контрактами.  
TECHSPEC фиксирует минимальный набор команд v1 и формат ответа `ok | domainError | infraError` с унифицированной ошибкой `{ code, message, retryable, context }`.

## Решение

1. Ввести единый `ApplicationCommandBus` для всех обязательных команд v1 из TECHSPEC.
2. Ввести `ApplicationQueryBus` для типизированного чтения состояния (`GetCoreState`, `GetHelpWindowState`) вместо прямого обхода application-слоя.
3. Зафиксировать общий `ApplicationResult<T>`:
   - `ok` с полезной нагрузкой,
   - `domainError` для бизнес-валидации,
   - `infraError` для инфраструктурных сбоев.
4. Добавить единый `ApplicationError` envelope с обязательными полями `code/message/retryable/context`.
5. Проверять маршрутизацию обязательных команд интеграционным smoke-тестом.

## Последствия

- Все application use-cases имеют единый способ вызова и единый формат результата.
- Адаптеры получают предсказуемые контракты и могут различать domain vs infra ошибки без ad-hoc логики.
- Переход к последующим INIT/CODE задачам упрощается: новые команды/queries добавляются без изменения транспортного формата.
