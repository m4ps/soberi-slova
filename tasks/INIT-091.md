# [INIT]-[091] Удаление ненужного кода и зависимостей этапа

## Что сделано

- Проведена ревизия зависимостей проекта:
  - `npx depcheck` не обнаружил неиспользуемых пакетов;
  - состав `dependencies/devDependencies` оставлен без расширений, как минимально достаточный для текущего init-этапа.
- Удалены неиспользуемые bootstrap-зависимости из application-контракта:
  - из `DomainModules` убраны `wordValidation` и `levelGenerator`;
  - `createApplicationLayer` теперь принимает только реально используемые зависимости (`coreState`, `helpEconomy`).
- Обновлён composition root `src/main.ts`:
  - удалены импорты и создание неиспользуемых модулей `WordValidation`/`LevelGenerator`.
- Обновлён smoke-тест `tests/application-command-bus.smoke.test.ts` под минимизированный контракт зависимостей.
- Добавлена follow-up задача в backlog: `[TEST]-[007] Стабилизировать Playwright smoke в TLS-контуре dev-proxy`.

## Верификация

- `npm run ci:baseline` — passed
  - `typecheck` — passed
  - `test` — passed
  - `lint` — passed
  - `format:check` — passed
  - `build` — passed
- Playwright smoke через `develop-web-game` client — passed:
  - запуск: `$WEB_GAME_CLIENT --url http://localhost:5173 --actions-file $WEB_GAME_ACTIONS --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-init091-smoke`
  - использован временный локальный mock `/sdk.js` на время smoke-прогона (обход self-signed сертификата `sdk-dev-proxy` для клиента Playwright);
  - артефакты: `output/web-game-init091-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - ошибок консоли нет (`errors-*.json` не созданы).

## Принятые решения

- [ADR-010: Минимизация bootstrap-зависимостей Application на этапе INIT](../ADR/ADR-010-init-minimal-bootstrap-dependencies.md)
