# ADR-047: Paid-help-first runtime и live `HelpLockState`

- Статус: accepted
- Дата: 2026-03-08
- Связанные задачи: PVL-97, [CODE]-[026]

## Контекст

После `[DATA]-[009]` и связанных help/ad задач доменная схема уже требовала `helpLockState`, но рабочий runtime всё ещё сохранял legacy-семантику:

1. `HelpEconomy` оставлял ветку `apply-now` и `freeActionAvailable`;
2. `application` применял первый `hint`/`reshuffle` без rewarded ad;
3. `RenderMotion` продолжал показывать `free/ad` маркеры;
4. `Persistence` вычислял `helpLockState` из `helpWindow` на границе и продолжал писать новый `helpWindow` sidecar;
5. `RestoreSession` поднимал legacy help-window metadata как рабочее состояние.

Это расходилось с `TECHSPEC v1.1`, где оба help-действия должны идти через rewarded ads с первого использования, а `HelpLockState` должен быть единственным рабочим контрактом блокировок и cooldown.

## Решение

1. Перевести `HelpEconomy` на paid-help-first semantics:
   - убрать рабочую ветку `apply-now`;
   - любой `RequestHint` / `RequestReshuffle` после проверки lock/cooldown всегда возвращает `await-ad`;
   - legacy-поля `windowStartTs/freeActionAvailable` сохраняются только как compatibility/transport shape, но не влияют на runtime-решение.

2. Сделать `HelpLockState` live-состоянием приложения:
   - `application` синхронизирует lock/cooldown из `HelpEconomy` в `CoreState` на запросе помощи, ad-acknowledgement и query boundary;
   - `CoreState` получает явный `syncHelpLockState(...)`, который обновляет `GameState` только при реальном изменении lock-state.

3. Зафиксировать rewarded-only event contract:
   - `domain/help` (`phase=requested`) больше не несёт free-path metadata;
   - `domain/help-action-applied` / `domain/help-action-failed` остаются только для `AcknowledgeAdResult`;
   - `source` фиксируется как `rewarded-ad`.

4. Очистить persistence/runtime от записи нового legacy help-window:
   - в persisted `gameStateSerialized` сохраняется уже синхронизированный `helpLockState`;
   - новый persistence envelope больше не пишет `helpWindow` для текущих snapshot;
   - при restore transient help-state сбрасывается, а sidecar `helpWindow` остаётся только read-only compatibility path для старых payload.

5. Синхронизировать UI с paid-help-first UX:
   - help-кнопки больше не показывают `free/ad` badges;
   - disable/cooldown состояние читается из live `helpLockState`.

## Последствия

- В runtime больше нет рабочего бесплатного help-пути: оба help-действия стартуют через rewarded ad.
- `GameState.helpLockState` стал актуальным live-срезом блокировки/cooldown, а не только persistence-проекцией.
- Новые snapshot больше не закрепляют legacy `helpWindow` как актуальный контракт, но старые snapshot по-прежнему безопасно читаются через migration path.
- Поведение UI, telemetry и persistence теперь согласовано вокруг одного rewarded-only help-flow.
