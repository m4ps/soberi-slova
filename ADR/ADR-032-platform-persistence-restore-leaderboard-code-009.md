# ADR-032: Platform/Persistence restore pipeline и leaderboard sync queue

- Статус: accepted
- Дата: 2026-02-25
- Связанные задачи: [CODE]-[009]

## Контекст

Для `[CODE]-[009]` требовалось закрыть end-to-end контракт интеграции:

1. restore состояния из local/cloud c LWW merge и best-effort восстановлением уровня;
2. гарантия сохранности `allTimeScore` и `free-action` timer;
3. leaderboard sync через `setScore` с retry/backoff без блокировки gameplay;
4. auth-диалог только по явному пользовательскому действию.

До изменения:

- `Persistence` был stub без реального I/O;
- `RestoreSession` не применял persisted данные к доменному состоянию;
- `PlatformYandex` покрывал lifecycle + rewarded ads, но не player/storage/leaderboard;
- leaderboard sync и auth flow фактически отсутствовали.

## Решение

1. Ввести persisted envelope для snapshot-слоя:
   - `{ schemaVersion, capturedAt, gameStateSerialized, helpWindow }`;
   - envelope хранится локально (`safeStorage` с fallback на `localStorage`) и в cloud mirror (`player.setData`).

2. Реализовать bridge-ответственности в `PlatformYandex`:
   - `readPersistenceState` / `writePersistenceState` как единая точка доступа к SDK storage/player APIs;
   - `player.getStats/setStats` используется как cloud hint для `allTimeScore`;
   - логика auth + leaderboard sync инкапсулирована в адаптере.

3. Реализовать `CoreState.restoreSession(...)` как source-of-truth для domain restore:
   - LWW выбор winner (`local/cloud`) через `resolveLwwSnapshot`;
   - score-preserving стратегия (`max(local, cloud, cloudStatsHint)`);
   - fallback на новый `active` уровень при нересторибельном level state (`pending ops`, не-`active` status).

4. Отделить восстановление help-таймера от snapshot `GameState`:
   - `HelpEconomy.restoreWindowState(...)` восстанавливает `windowStartTs/freeActionAvailable`;
   - transient lock/cooldown/pending state не переносится между сессиями.

5. Ввести leaderboard sync queue:
   - auto-trigger по score-изменениям (`domain/word-submitted`, `domain/word-success`);
   - manual-trigger по `domain/leaderboard-sync` (нажатие leaderboard кнопки);
   - retry/backoff: `0.5s`, `1.5s`, `4s`, не блокируя основной игровой цикл.

## Последствия

- Restore контракт PRD/TECHSPEC выполняется: score/timer поднимаются на рестарте, уровень восстанавливается best-effort, при проблеме создаётся новый уровень без потери прогресса.
- Persistence слой стал event-driven и не зависит от UI-потока.
- Auth политика соблюдена: автоматический sync не открывает диалог, ручной sync может инициировать `openAuthDialog`.
- Leaderboard sync устойчив к временным сбоям SDK/сети и не тормозит gameplay.
