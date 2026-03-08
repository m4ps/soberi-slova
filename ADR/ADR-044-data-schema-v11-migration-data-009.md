# ADR-044: DATA-009 — переходная миграция схемы `GameState` к `TECHSPEC v1.1`

## Статус

Принято, 2026-03-08.

## Контекст

Историческая runtime-модель закрепила в `GameState` поля `helpWindow` и `LevelSession.meta`, а также рабочие допущения `5x5`.
Текущий `TECHSPEC.md` требует другую доменную форму:

- `GameState.helpLockState`;
- `LevelSession.wordMixStats`;
- `LevelSession.grid[36]`.

При этом runtime ещё сохраняет отдельный модуль `HelpEconomy`, а persistence уже умеет хранить sidecar `helpWindow`.
Полный отказ от legacy help-runtime будет выполняться отдельными follow-up задачами, поэтому для `DATA-009` нужен безопасный переходный слой без повторного возврата legacy-полей в актуальную доменную схему.

## Решение

1. `GameState` переводится на `schemaVersion=4` и больше не содержит `helpWindow` как выходное поле.
2. `LevelSession` переводится на `wordMixStats`; legacy `meta` остаётся только входным compatibility-path для миграции старых snapshot.
3. Миграция `v3 -> v4` детерминированно:
   - разворачивает legacy `5x5` grid в `6x6`;
   - производит `helpLockState` из legacy `helpWindow`, если snapshot ещё старый.
4. Текущий runtime не берёт `helpLockState` из `CoreState` как live-source для help-flow. Вместо этого persistence при сериализации вычисляет актуальный `helpLockState` на границе из состояния `HelpEconomy`.
5. При restore отсутствие `helpWindow` в persistence envelope больше не компенсируется чтением legacy `gameState.helpWindow`; это поле не возвращается в рабочую схему и не становится источником истины повторно.

## Последствия

- Доменная схема синхронизирована с `TECHSPEC v1.1`, а legacy-поля остаются только migration/adaptation path.
- Restore старых snapshot остаётся безопасным: старые `helpWindow/meta/5x5` payload продолжают подниматься в новую схему.
- Help-runtime по-прежнему живёт в отдельном модуле `HelpEconomy`; дальнейший полный переход на paid-help/lock-only semantics остаётся задачами этапа `CODE`.
- Persistence и тесты получают явную границу: `helpWindow` допустим только как sidecar legacy/transport payload, но не как доменное поле `GameState`.
