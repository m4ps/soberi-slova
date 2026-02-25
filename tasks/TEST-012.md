# [TEST]-[012] Добавить browser E2E-тест зачета target-слов через реальную разгадку

## Что сделано

- Добавлен Playwright E2E-сценарий `tests/e2e/test-012-target-word-submit.mjs`.
- Сценарий:
  - поднимает локальный Vite runtime;
  - мокает `sdk.js` через `page.route`;
  - читает target-слово из dev-debug источника (`console.info('[dev][target-words]', ...)`);
  - вычисляет валидный путь слова по grid и выполняет реальный swipe указателем по canvas;
  - проверяет `x/N`, `found=true` в dev-debug логе и начисление `target score`.
- Добавлена npm-команда запуска: `npm run test:e2e:test-012`.
- Добавлена зависимость `playwright` в `devDependencies`.
- Сценарий детерминированно воспроизвёл дефект до фикса (target не засчитывался), после фикса стабильно проходит.

## Верификация

- `npm run test:e2e:test-012` — passed.
- `npm run ci:baseline` — passed.

## Принятые решения

- [ADR-037: Target-first классификация в WordValidation для submit-path](../ADR/ADR-037-target-priority-word-validation-code-014-test-012.md)
