import assert from 'node:assert/strict';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const TEST_HOST = '127.0.0.1';
const TEST_PORT = 4173;
const DEV_TARGET_WORDS_PREFIX = '[dev][target-words]';
const TARGET_SCORE_BASE = 4;
const TARGET_SCORE_PER_LETTER = 1;

const MOCK_SDK_SOURCE = `
(() => {
  const listeners = new Map();

  const storageApi = {
    async getItem(key) {
      return localStorage.getItem(key);
    },
    async setItem(key, value) {
      localStorage.setItem(key, String(value));
    },
  };

  const playerData = Object.create(null);
  const playerStats = Object.create(null);

  const playerApi = {
    isAuthorized() {
      return false;
    },
    async getData(keys) {
      if (!Array.isArray(keys) || keys.length === 0) {
        return { ...playerData };
      }

      const result = Object.create(null);
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(playerData, key)) {
          result[key] = playerData[key];
        }
      }

      return result;
    },
    async setData(data) {
      if (!data || typeof data !== 'object') {
        return;
      }

      Object.assign(playerData, data);
    },
    async getStats(keys) {
      if (!Array.isArray(keys) || keys.length === 0) {
        return { ...playerStats };
      }

      const result = Object.create(null);
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(playerStats, key)) {
          result[key] = playerStats[key];
        }
      }

      return result;
    },
    async setStats(stats) {
      if (!stats || typeof stats !== 'object') {
        return;
      }

      Object.assign(playerStats, stats);
    },
  };

  const sdk = {
    features: {
      LoadingAPI: {
        ready() {},
      },
      GameplayAPI: {
        start() {},
        stop() {},
      },
    },
    async getStorage() {
      return storageApi;
    },
    async getPlayer() {
      return playerApi;
    },
    adv: {
      showRewardedVideo(options = {}) {
        const callbacks = options.callbacks ?? {};
        callbacks.onOpen?.();
        callbacks.onRewarded?.();
        callbacks.onClose?.();
      },
    },
    auth: {
      async openAuthDialog() {},
    },
    leaderboards: {
      async setScore() {},
    },
    on(eventName, callback) {
      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set());
      }

      listeners.get(eventName).add(callback);
    },
    off(eventName, callback) {
      listeners.get(eventName)?.delete(callback);
    },
  };

  window.YaGames = {
    async init() {
      return sdk;
    },
  };
})();
`;

function parseJsonOrNull(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function waitForCondition(check, timeoutMs, message) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await check();
    if (value) {
      return value;
    }

    await sleep(50);
  }

  throw new Error(message);
}

function extractWordLogPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const levelId = payload.levelId;
  const words = payload.words;

  if (typeof levelId !== 'string' || !Array.isArray(words)) {
    return null;
  }

  const normalizedWords = words
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const word = entry.word;
      const found = entry.found;
      if (typeof word !== 'string' || typeof found !== 'boolean') {
        return null;
      }

      return { word, found };
    })
    .filter((entry) => entry !== null);

  if (normalizedWords.length !== words.length) {
    return null;
  }

  return {
    levelId,
    words: normalizedWords,
  };
}

function findPathForWord(grid, gridSide, targetWord) {
  if (
    !Array.isArray(grid) ||
    !Number.isInteger(gridSide) ||
    gridSide <= 0 ||
    grid.length !== gridSide * gridSide ||
    targetWord.length === 0
  ) {
    return null;
  }

  const directions = [
    { rowOffset: -1, colOffset: -1 },
    { rowOffset: -1, colOffset: 0 },
    { rowOffset: -1, colOffset: 1 },
    { rowOffset: 0, colOffset: -1 },
    { rowOffset: 0, colOffset: 1 },
    { rowOffset: 1, colOffset: -1 },
    { rowOffset: 1, colOffset: 0 },
    { rowOffset: 1, colOffset: 1 },
  ];

  const visited = new Set();
  const path = [];

  const dfs = (row, col, letterIndex) => {
    if (row < 0 || row >= gridSide || col < 0 || col >= gridSide) {
      return false;
    }

    const cellIndex = row * gridSide + col;
    if (visited.has(cellIndex)) {
      return false;
    }

    if (grid[cellIndex] !== targetWord[letterIndex]) {
      return false;
    }

    visited.add(cellIndex);
    path.push({ row, col });

    if (letterIndex === targetWord.length - 1) {
      return true;
    }

    for (const direction of directions) {
      if (dfs(row + direction.rowOffset, col + direction.colOffset, letterIndex + 1)) {
        return true;
      }
    }

    path.pop();
    visited.delete(cellIndex);
    return false;
  };

  for (let row = 0; row < gridSide; row += 1) {
    for (let col = 0; col < gridSide; col += 1) {
      if (dfs(row, col, 0)) {
        return [...path];
      }

      visited.clear();
      path.length = 0;
    }
  }

  return null;
}

function resolveCellCenter(canvasBox, gridLayout, gridSide, cell) {
  const cellSize = gridLayout.width / gridSide;

  return {
    x: canvasBox.x + gridLayout.x + cell.col * cellSize + cellSize / 2,
    y: canvasBox.y + gridLayout.y + cell.row * cellSize + cellSize / 2,
  };
}

async function swipePath(page, canvasBox, gridLayout, gridSide, pathCells) {
  const [firstCell] = pathCells;
  if (!firstCell) {
    throw new Error('Path is empty; cannot perform swipe.');
  }

  const firstPoint = resolveCellCenter(canvasBox, gridLayout, gridSide, firstCell);
  await page.mouse.move(firstPoint.x, firstPoint.y);
  await page.mouse.down();

  for (let index = 1; index < pathCells.length; index += 1) {
    const cell = pathCells[index];
    if (!cell) {
      continue;
    }

    const point = resolveCellCenter(canvasBox, gridLayout, gridSide, cell);
    await page.mouse.move(point.x, point.y, { steps: 8 });
    await sleep(16);
  }

  await page.mouse.up();
}

async function readRenderSnapshot(page) {
  const rendered = await page.evaluate(() => {
    if (typeof window.render_game_to_text !== 'function') {
      return null;
    }

    return window.render_game_to_text();
  });

  if (typeof rendered !== 'string') {
    throw new Error('render_game_to_text is unavailable.');
  }

  const parsed = parseJsonOrNull(rendered);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('render_game_to_text returned malformed JSON.');
  }

  return parsed;
}

async function main() {
  const devWordLogState = {
    latest: null,
  };

  const viteServer = await createServer({
    server: {
      host: TEST_HOST,
      port: TEST_PORT,
      strictPort: true,
    },
    logLevel: 'error',
  });

  await viteServer.listen();

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });

  try {
    const page = await browser.newPage();
    await page.route('**/sdk.js', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: MOCK_SDK_SOURCE,
      });
    });

    page.on('console', (message) => {
      void (async () => {
        const args = message.args();
        if (args.length < 2) {
          return;
        }

        const prefix = await args[0]?.jsonValue().catch(() => null);
        if (prefix !== DEV_TARGET_WORDS_PREFIX) {
          return;
        }

        const payload = await args[1]?.jsonValue().catch(() => null);
        const parsedPayload = extractWordLogPayload(payload);
        if (parsedPayload) {
          devWordLogState.latest = parsedPayload;
        }
      })();
    });

    await page.goto(`http://${TEST_HOST}:${TEST_PORT}`, {
      waitUntil: 'domcontentloaded',
    });

    const initialTargetLog = await waitForCondition(
      async () => devWordLogState.latest,
      8000,
      'Timed out while waiting for initial dev target words log.',
    );

    const initialLevelId = initialTargetLog.levelId;

    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible' });

    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) {
      throw new Error('Failed to resolve canvas bounding box.');
    }

    const initialSnapshot = await waitForCondition(
      async () => {
        const snapshot = await readRenderSnapshot(page);
        if (!snapshot?.layout?.buttons?.reshuffle) {
          return null;
        }

        return snapshot;
      },
      8000,
      'Timed out while waiting for initial runtime layout snapshot.',
    );
    const reshuffleButton = initialSnapshot.layout.buttons.reshuffle;

    await page.mouse.click(
      canvasBox.x + reshuffleButton.x + reshuffleButton.width / 2,
      canvasBox.y + reshuffleButton.y + reshuffleButton.height / 2,
    );

    const reshuffledTargetLog = await waitForCondition(
      async () => {
        const payload = devWordLogState.latest;
        if (!payload || payload.levelId === initialLevelId) {
          return null;
        }

        return payload;
      },
      8000,
      'Timed out while waiting for reshuffled level target words log.',
    );

    const reshuffledLevelId = reshuffledTargetLog.levelId;
    const targetWordEntry = reshuffledTargetLog.words.find((entry) => !entry.found);
    if (!targetWordEntry) {
      throw new Error('Reshuffled level has no unresolved target words.');
    }

    const targetWord = targetWordEntry.word;

    const runtimeSnapshot = await waitForCondition(
      async () => {
        const snapshot = await readRenderSnapshot(page);
        if (!snapshot || typeof snapshot !== 'object') {
          return null;
        }

        if (snapshot.gameplay?.levelId !== reshuffledLevelId) {
          return null;
        }

        const grid = snapshot.gameplay?.grid;
        const layoutGrid = snapshot.layout?.grid;
        if (
          !grid ||
          !Number.isInteger(grid.side) ||
          !Array.isArray(grid.letters) ||
          !layoutGrid ||
          typeof layoutGrid.x !== 'number' ||
          typeof layoutGrid.y !== 'number' ||
          typeof layoutGrid.width !== 'number' ||
          typeof layoutGrid.height !== 'number'
        ) {
          return null;
        }

        return snapshot;
      },
      8000,
      'Timed out while waiting for reshuffled runtime grid snapshot.',
    );

    const runtimeGrid = runtimeSnapshot.gameplay.grid;
    const pathForTargetWord = findPathForWord(runtimeGrid.letters, runtimeGrid.side, targetWord);

    if (!pathForTargetWord || pathForTargetWord.length === 0) {
      throw new Error(`Cannot resolve path for target word "${targetWord}".`);
    }

    const beforeSnapshot = await readRenderSnapshot(page);
    const beforeFoundTargets = beforeSnapshot.gameplay.progress.foundTargets;
    const beforeScore = beforeSnapshot.gameplay.allTimeScore;

    await swipePath(
      page,
      canvasBox,
      beforeSnapshot.layout.grid,
      beforeSnapshot.gameplay.grid.side,
      pathForTargetWord,
    );

    const expectedWordScore = TARGET_SCORE_BASE + TARGET_SCORE_PER_LETTER * targetWord.length;

    let lastObservedSnapshot = null;
    const afterSnapshot = await waitForCondition(
      async () => {
        const snapshot = await readRenderSnapshot(page);
        lastObservedSnapshot = snapshot;
        const foundTargets = snapshot.gameplay.progress.foundTargets;
        const allTimeScore = snapshot.gameplay.allTimeScore;

        if (foundTargets !== beforeFoundTargets + 1) {
          return null;
        }

        if (allTimeScore < beforeScore + expectedWordScore) {
          return null;
        }

        return snapshot;
      },
      4000,
      'Target word was not credited after real swipe.',
    ).catch((error) => {
      const lastFoundTargets = lastObservedSnapshot?.gameplay?.progress?.foundTargets;
      const lastScore = lastObservedSnapshot?.gameplay?.allTimeScore;
      const pathTrace = pathForTargetWord.map((cell) => `${cell.row}:${cell.col}`).join(' -> ');

      throw new Error(
        `${error.message} target=${targetWord} level=${reshuffledLevelId} expectedScoreDelta=${expectedWordScore} path=${pathTrace} beforeFoundTargets=${beforeFoundTargets} beforeScore=${beforeScore} lastFoundTargets=${String(lastFoundTargets)} lastScore=${String(lastScore)}`,
      );
    });

    const foundInDevLog = await waitForCondition(
      async () => {
        const payload = devWordLogState.latest;
        if (!payload || payload.levelId !== reshuffledLevelId) {
          return null;
        }

        const foundEntry = payload.words.find((entry) => entry.word === targetWord);
        if (!foundEntry || foundEntry.found !== true) {
          return null;
        }

        return true;
      },
      4000,
      `Target word "${targetWord}" is still not marked as found in dev debug log.`,
    ).catch((error) => {
      const latestPayload = devWordLogState.latest;
      throw new Error(`${error.message} latestDevLog=${JSON.stringify(latestPayload)}`);
    });

    assert.equal(foundInDevLog, true);
    assert.equal(
      afterSnapshot.gameplay.allTimeScore - beforeScore,
      expectedWordScore,
      'Unexpected target score delta after swipe submit.',
    );

    console.log(
      `[TEST-012] success: target="${targetWord}", level="${reshuffledLevelId}", progress=${beforeFoundTargets}->${afterSnapshot.gameplay.progress.foundTargets}, score=${beforeScore}->${afterSnapshot.gameplay.allTimeScore}`,
    );
  } finally {
    await browser.close();
    await viteServer.close();
  }
}

main().catch((error) => {
  console.error('[TEST-012] failure:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
