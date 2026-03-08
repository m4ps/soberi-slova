# ADR-045: LevelGenerator синхронизируется с quota-aware 6x6 scaffold из TECHSPEC v1.1

- Статус: accepted
- Дата: 2026-03-08
- Связанные задачи: PVL-98, [CODE]-[027]
- Supersedes: ADR-042 в части word-mix контракта генератора

## Контекст

`TECHSPEC.md`, `PRD.md` и доменная модель `GameState` уже фиксируют generator contract для `6x6`:

- `10..15` target-слов;
- scaffold около `35/35/30` для short/medium/long с допустимыми отклонениями;
- минимум `30%` длинных слов;
- `wordMixStats` и `readabilityScore` как runtime diagnostics;
- rejection для quota-invalid наборов и unreadable displayed target.

При этом `LevelGenerator` оставался в промежуточном состоянии после ADR-042:

- long quota больше не считалась обязательной;
- отбор слов был readability-first и добирал long только как fallback;
- generator-side diagnostics не прокидывались явно в runtime session;
- часть уровней проходила generator-тесты, но расходилась с актуальными runtime-инвариантами.

## Решение

1. Сделать `resolveLevelGeneratorScaffold` из `GameState` единственным источником истины для word-mix генератора.
2. Подбирать exact mix short/medium/long внутри допустимого scaffold-окна, а не добирать long words только по остаточному принципу.
3. Считать `wordMixStats` и `readabilityScore` прямо в generator output и сохранять их в `LevelSession` без повторного смыслового расхождения.
4. Оставить deterministic anti-repeat по `recentTargetWords`, но расширить rejection rules:
   - отклонять target-set, если не выполнены quota/readability инварианты;
   - отклонять layout при path unreadability;
   - отклонять уровень, если текущий displayed target был бы unreadable до старта gameplay.

## Последствия

- Generator output снова совпадает с `TECHSPEC v1.1` и `GameState` без скрытого fallback-контракта.
- `wordMixStats` доступны как на уровне generator diagnostics, так и в runtime session.
- Anti-repeat остаётся детерминированным, но больше не может размывать обязательную long-word quota.
- ADR-042 больше нельзя использовать как источник истины для short/medium-only generator strategy.
