# [INIT]-[093] Анализ безопасности этапа инициализации

## Что сделано

- Проведён security-аудит init bootstrap-поверхности: загрузка SDK, lifecycle wiring, fail-state при недоступности SDK, отсутствие hardcoded secrets.
- Добавлен краткий security checklist: `docs/security/init-bootstrap-checklist.md`.
- Усилен `PlatformYandex` адаптер (`src/adapters/PlatformYandex/index.ts`):
  - добавлена валидация trusted SDK source (только same-origin `/sdk.js` для runtime-loader);
  - добавлен lifecycle event `bootstrap-failed`;
  - реализован rollback подписок и gameplay при падении bootstrap после частичной инициализации.
- Усилен bootstrap-поток в `src/main.ts`:
  - реализован controlled cleanup частично поднятых модулей при ошибке;
  - добавлен технический fail-state на экране;
  - `render_game_to_text` и `advanceTime` переводятся в безопасный деградированный режим.
- Расширены контрактные тесты `tests/platform-yandex.adapter.test.ts`:
  - reject untrusted sdk script source;
  - rollback gameplay/listeners при ошибке dispatch `RuntimeReady`.

## Верификация

- `npm run ci:baseline` — passed
- `rg -n '(token|secret|apikey|api_key|password|passwd|client_secret|private key|BEGIN [A-Z ]*PRIVATE KEY)' src config scripts tests .github README.md` — passed (hardcoded secrets не обнаружены; единственное совпадение `id-token` в GitHub Actions permissions).
- Playwright smoke через `develop-web-game` client — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://localhost:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-init093-smoke`
  - проверены артефакты `shot-*.png`, `state-*.json`; файлов `errors-*.json` не создано.

## Принятые решения

- [ADR-012: Security hardening bootstrap-контура INIT](../ADR/ADR-012-init-bootstrap-security-hardening.md)
