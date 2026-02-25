# [DATA]-[190] Приборка этапа модели данных

## Что сделано

- Проведена ревизия data-слоя и артефактов этапа DATA-001..DATA-005:
  - подтверждено отсутствие временных data-fixtures, отладочных dump-файлов и черновиков миграций в трекаемых файлах репозитория.
- Добавлен воспроизводимый cleanup data-этапа:
  - в `package.json` добавлен `npm run clean:data`;
  - команда переиспользует `clean:init` и дополнительно удаляет временные `data/*.tmp|*.dump|*.draft` CSV/JSON файлы.
- Зафиксированы ignore-правила для временных data-артефактов:
  - `.gitignore` дополнен паттернами `data/*.tmp.*`, `data/*.dump.*`, `data/*.draft.*`.
- Синхронизирована документация:
  - `README.md` дополнен командой `clean:data` и правилом cleanup для data-контура.

## Верификация

- `npm run clean:data` — passed.
- `npm run ci:baseline` — passed (`typecheck`, `test`, `lint`, `format:check`, `build`).
- Playwright smoke (`develop-web-game`) — passed:
  - запуск: `node "$WEB_GAME_CLIENT" --url http://127.0.0.1:5173 --actions-file "$WEB_GAME_ACTIONS" --iterations 2 --pause-ms 250 --screenshot-dir output/web-game-data190-smoke`;
  - использован временный `public/sdk.js` mock для `/sdk.js`, после прогона удалён;
  - артефакты: `output/web-game-data190-smoke/shot-0.png`, `shot-1.png`, `state-0.json`, `state-1.json`;
  - `errors-*.json` отсутствуют.

## Принятые решения

- [ADR-019: Политика гигиены временных data-артефактов](../ADR/ADR-019-data-artifact-hygiene-data-190.md)
