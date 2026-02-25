import { describe, expect, it } from 'vitest';

import {
  GAME_STATE_SCHEMA_VERSION,
  createGameState,
  createLevelSession,
  createWordEntry,
  deserializeGameState,
  deserializeWordEntry,
  serializeGameState,
  serializeWordEntry,
  type GameStateInput,
  type WordEntryInput,
} from '../src/domain/GameState';

function createFixtureGameStateInput(): GameStateInput {
  return {
    updatedAt: 1_710_000_000_000,
    allTimeScore: 420,
    currentLevelSession: {
      levelId: 'level-42',
      grid: [
        'д',
        'о',
        'м',
        'р',
        'а',
        'к',
        'о',
        'т',
        'е',
        'л',
        'с',
        'л',
        'о',
        'в',
        'о',
        'н',
        'о',
        'ч',
        'ь',
        'ю',
        'м',
        'и',
        'р',
        'я',
        'ё',
      ],
      targetWords: ['дом', 'слово', 'ночь'],
      foundTargets: ['дом'],
      foundBonuses: ['кот'],
      status: 'active',
      seed: 42,
      meta: {
        layoutVariant: 'spiral',
        hasRareLetters: false,
      },
    },
    helpWindow: {
      windowStartTs: 1_710_000_000_000,
      freeActionAvailable: true,
      pendingHelpRequest: {
        operationId: 'help-op-1',
        kind: 'hint',
        requestedAt: 1_710_000_000_123,
      },
    },
    pendingOps: [
      {
        operationId: 'pending-1',
        kind: 'help-hint',
        status: 'pending',
        retryCount: 0,
        createdAt: 1_710_000_000_123,
        updatedAt: 1_710_000_000_123,
      },
      {
        operationId: 'pending-2',
        kind: 'leaderboard-sync',
        status: 'applied',
        retryCount: 1,
        createdAt: 1_710_000_000_500,
        updatedAt: 1_710_000_001_000,
      },
    ],
    leaderboardSync: {
      lastSubmittedScore: 420,
      lastAckScore: 380,
      lastSubmitTs: 1_710_000_001_000,
    },
  };
}

describe('game state model', () => {
  it('builds typed entities with runtime constructors and applies defaults', () => {
    const input = createFixtureGameStateInput();
    const state = createGameState(input);

    expect(state.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
    expect(state.stateVersion).toBe(0);
    expect(state.currentLevelSession.levelId).toBe('level-42');
    expect(state.helpWindow.pendingHelpRequest?.kind).toBe('hint');
    expect(state.pendingOps).toHaveLength(2);
  });

  it('keeps constructor output detached from mutable input references', () => {
    const grid = ['д', 'о', 'м'];
    const targetWords = ['дом'];
    const session = createLevelSession({
      levelId: 'level-copy-check',
      grid,
      targetWords,
      foundTargets: [],
      foundBonuses: [],
      status: 'active',
      seed: 7,
    });

    grid[0] = 'я';
    targetWords.push('кот');

    expect(session.grid).toEqual(['д', 'о', 'м']);
    expect(session.targetWords).toEqual(['дом']);
  });

  it('serializes and deserializes GameState snapshots without structural loss', () => {
    const input = createFixtureGameStateInput();
    const state = createGameState({
      ...input,
      schemaVersion: 3,
      stateVersion: 17,
    });

    const serialized = serializeGameState(state);
    const restored = deserializeGameState(serialized);

    expect(restored).toEqual(state);
  });

  it('serializes and deserializes WordEntry snapshots', () => {
    const entryInput: WordEntryInput = {
      id: 101,
      bare: 'слово',
      rank: 9.5,
      type: 'noun',
      normalized: 'слово',
    };
    const entry = createWordEntry(entryInput);
    const restored = deserializeWordEntry(serializeWordEntry(entry));

    expect(restored).toEqual(entry);
  });

  it('rejects malformed GameState snapshots at deserialization boundary', () => {
    expect(() => deserializeGameState('{not-json')).toThrow('[game-state] Invalid JSON snapshot.');
    expect(() => deserializeGameState(JSON.stringify({ schemaVersion: 1 }))).toThrow(
      '[game-state] gameState.stateVersion must be a finite number.',
    );
  });
});
