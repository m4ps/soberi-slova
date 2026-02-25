import { describe, expect, it } from 'vitest';

import {
  GAME_STATE_SCHEMA_VERSION,
  GameStateDomainError,
  createGameState,
  createLevelSession,
  createWordEntry,
  deserializeGameState,
  deserializeGameStateWithMigrations,
  deserializeWordEntry,
  isGameStateDomainError,
  migrateGameStateSnapshot,
  resolveLwwSnapshot,
  serializeGameState,
  serializeWordEntry,
  type GameStateInput,
  type WordEntryInput,
} from '../src/domain/GameState';

function createValidGrid(): string[] {
  return [
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
  ];
}

function createFixtureGameStateInput(): GameStateInput {
  return {
    updatedAt: 1_710_000_000_000,
    allTimeScore: 420,
    currentLevelSession: {
      levelId: 'level-42',
      grid: createValidGrid(),
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

function createLegacySnapshotV0WithoutStateVersion(): Record<string, unknown> {
  const legacySnapshot: Record<string, unknown> = {
    ...createFixtureGameStateInput(),
    schemaVersion: 0,
  };

  delete legacySnapshot.pendingOps;

  return legacySnapshot;
}

function expectDomainErrorWithCode(action: () => unknown, expectedCode: string): void {
  try {
    action();
    throw new Error('Expected GameStateDomainError to be thrown.');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(GameStateDomainError);
    expect(isGameStateDomainError(error)).toBe(true);
    if (isGameStateDomainError(error)) {
      expect(error.code).toBe(expectedCode);
      expect(error.retryable).toBe(false);
    }
  }
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
    const grid = createValidGrid();
    const targetWords = ['дом', 'слово', 'ночь'];
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

    expect(session.grid).toEqual(createValidGrid());
    expect(session.targetWords).toEqual(['дом', 'слово', 'ночь']);
  });

  it('serializes and deserializes GameState snapshots without structural loss', () => {
    const input = createFixtureGameStateInput();
    const state = createGameState({
      ...input,
      schemaVersion: GAME_STATE_SCHEMA_VERSION,
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

  it('migrates legacy v0 snapshots to current schema deterministically', () => {
    const legacySnapshot = createLegacySnapshotV0WithoutStateVersion();

    const firstMigration = migrateGameStateSnapshot(legacySnapshot);
    const secondMigration = migrateGameStateSnapshot(legacySnapshot);
    const migratedFromSerialized = deserializeGameStateWithMigrations(
      JSON.stringify(legacySnapshot),
    );

    expect(firstMigration).toEqual(secondMigration);
    expect(firstMigration).toEqual(migratedFromSerialized);
    expect(firstMigration.schemaVersionBefore).toBe(0);
    expect(firstMigration.schemaVersionAfter).toBe(GAME_STATE_SCHEMA_VERSION);
    expect(firstMigration.appliedMigrations).toEqual([
      { fromVersion: 0, toVersion: 1 },
      { fromVersion: 1, toVersion: 2 },
    ]);
    expect(firstMigration.state.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
    expect(firstMigration.state.stateVersion).toBe(0);
    expect(firstMigration.state.pendingOps).toEqual([]);
  });

  it('drops out-of-scope legacy fields while migrating v1 snapshots to current schema', () => {
    const baseInput = createFixtureGameStateInput();
    const legacyV1Snapshot: Record<string, unknown> = {
      ...baseInput,
      schemaVersion: 1,
      stateVersion: 3,
      sessionScore: 999,
      achievements: ['first-word'],
      dailyQuests: { completed: 1 },
      tutorialTraces: ['intro-step-1'],
      currentLevelSession: {
        ...baseInput.currentLevelSession,
        sessionScore: 24,
        tutorialTrace: {
          step: 'swipe',
        },
      },
      helpWindow: {
        ...baseInput.helpWindow,
        pendingHelpRequest: {
          operationId: 'help-op-legacy',
          kind: 'hint',
          requestedAt: 1_710_000_000_999,
        },
      },
    };

    const migration = migrateGameStateSnapshot(legacyV1Snapshot);

    expect(migration.appliedMigrations).toEqual([{ fromVersion: 1, toVersion: 2 }]);
    expect(migration.state.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
    expect(migration.state.helpWindow.pendingHelpRequest).toEqual({
      operationId: 'help-op-legacy',
      kind: 'hint',
    });
    expect(migration.state).not.toHaveProperty('sessionScore');
    expect(migration.state.currentLevelSession).not.toHaveProperty('sessionScore');
    expect(migration.state.currentLevelSession).not.toHaveProperty('tutorialTrace');
  });

  it('rejects snapshots from unsupported future schema versions', () => {
    const baseInput = createFixtureGameStateInput();
    const futureSnapshot = {
      ...baseInput,
      schemaVersion: GAME_STATE_SCHEMA_VERSION + 1,
      stateVersion: 1,
    };

    expectDomainErrorWithCode(
      () => migrateGameStateSnapshot(futureSnapshot),
      'game-state.migration.unsupported-schema-version',
    );
  });

  it('resolves LWW conflict by stateVersion first', () => {
    const baseInput = createFixtureGameStateInput();
    const localSnapshot = createGameState({
      ...baseInput,
      stateVersion: 5,
      updatedAt: 10,
      allTimeScore: 500,
    });
    const cloudSnapshot = createGameState({
      ...baseInput,
      stateVersion: 4,
      updatedAt: 100,
      allTimeScore: 700,
    });

    const resolution = resolveLwwSnapshot(localSnapshot, cloudSnapshot);

    expect(resolution.winner).toBe('local');
    expect(resolution.reason).toBe('stateVersion');
    expect(resolution.resolvedState).toEqual(localSnapshot);
  });

  it('resolves LWW conflict by updatedAt when stateVersion is equal', () => {
    const baseInput = createFixtureGameStateInput();
    const localSnapshot = createGameState({
      ...baseInput,
      stateVersion: 5,
      updatedAt: 99,
    });
    const cloudSnapshot = createGameState({
      ...baseInput,
      stateVersion: 5,
      updatedAt: 100,
    });

    const resolution = resolveLwwSnapshot(localSnapshot, cloudSnapshot);

    expect(resolution.winner).toBe('cloud');
    expect(resolution.reason).toBe('updatedAt');
    expect(resolution.resolvedState).toEqual(cloudSnapshot);
  });

  it('keeps local snapshot on full LWW tie and supports serialized inputs', () => {
    const baseInput = createFixtureGameStateInput();
    const localSnapshot = {
      ...createLegacySnapshotV0WithoutStateVersion(),
      updatedAt: 120,
      allTimeScore: 111,
      leaderboardSync: {
        lastSubmittedScore: 111,
        lastAckScore: 111,
        lastSubmitTs: 120,
      },
    };
    const cloudSnapshot = createGameState({
      ...baseInput,
      stateVersion: 0,
      updatedAt: 120,
      allTimeScore: 999,
    });

    const resolution = resolveLwwSnapshot(
      JSON.stringify(localSnapshot),
      serializeGameState(cloudSnapshot),
    );

    expect(resolution.winner).toBe('local');
    expect(resolution.reason).toBe('local-priority');
    expect(resolution.resolvedState.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
    expect(resolution.resolvedState.stateVersion).toBe(0);
    expect(resolution.resolvedState.allTimeScore).toBe(111);
  });

  it('rejects level session with grid that is not 5x5', () => {
    const baseInput = createFixtureGameStateInput();
    const input: GameStateInput = {
      ...baseInput,
      currentLevelSession: {
        ...baseInput.currentLevelSession,
        grid: createValidGrid().slice(0, 24),
      },
    };

    expectDomainErrorWithCode(() => createGameState(input), 'game-state.invariant.grid-size');
  });

  it('rejects non-cyrillic grid cells', () => {
    const grid = createValidGrid();
    grid[10] = 'A';
    const baseInput = createFixtureGameStateInput();
    const input: GameStateInput = {
      ...baseInput,
      currentLevelSession: {
        ...baseInput.currentLevelSession,
        grid,
      },
    };

    expectDomainErrorWithCode(() => createGameState(input), 'game-state.invariant.grid-cyrillic');
  });

  it('rejects targetWords count outside 3..7 range', () => {
    const baseInput = createFixtureGameStateInput();
    const input: GameStateInput = {
      ...baseInput,
      currentLevelSession: {
        ...baseInput.currentLevelSession,
        targetWords: ['дом', 'ночь'],
        foundTargets: [],
        foundBonuses: [],
      },
    };

    expectDomainErrorWithCode(() => createGameState(input), 'game-state.invariant.target-count');
  });

  it('rejects duplicate words in targetWords', () => {
    const baseInput = createFixtureGameStateInput();
    const input: GameStateInput = {
      ...baseInput,
      currentLevelSession: {
        ...baseInput.currentLevelSession,
        targetWords: ['дом', 'дом', 'ночь'],
        foundTargets: [],
        foundBonuses: [],
      },
    };

    expectDomainErrorWithCode(() => createGameState(input), 'game-state.invariant.duplicate-word');
  });

  it('rejects intersections between foundTargets and foundBonuses', () => {
    const baseInput = createFixtureGameStateInput();
    const input: GameStateInput = {
      ...baseInput,
      currentLevelSession: {
        ...baseInput.currentLevelSession,
        targetWords: ['дом', 'кот', 'ночь'],
        foundTargets: ['кот'],
        foundBonuses: ['кот'],
      },
    };

    expectDomainErrorWithCode(
      () => createGameState(input),
      'game-state.invariant.found-sets-overlap',
    );
  });

  it('rejects unsafe integer counters to prevent overflow corruption', () => {
    const baseInput = createFixtureGameStateInput();
    const input: GameStateInput = {
      ...baseInput,
      allTimeScore: Number.MAX_SAFE_INTEGER + 1,
    };

    expectDomainErrorWithCode(() => createGameState(input), 'game-state.validation.safe-integer');
  });

  it('rejects pending operations with duplicate operationId values', () => {
    const baseInput = createFixtureGameStateInput();
    const duplicateOp = baseInput.pendingOps?.[0];
    const input: GameStateInput = {
      ...baseInput,
      pendingOps: duplicateOp
        ? [
            duplicateOp,
            {
              ...duplicateOp,
              kind: 'leaderboard-sync',
            },
          ]
        : [],
    };

    expectDomainErrorWithCode(
      () => createGameState(input),
      'game-state.invariant.pending-operation-duplicate-id',
    );
  });

  it('rejects pending operations with non-monotonic timestamps', () => {
    const baseInput = createFixtureGameStateInput();
    const input: GameStateInput = {
      ...baseInput,
      pendingOps: [
        {
          operationId: 'pending-invalid-timeline',
          kind: 'restore-session',
          status: 'pending',
          retryCount: 0,
          createdAt: 200,
          updatedAt: 199,
        },
      ],
    };

    expectDomainErrorWithCode(
      () => createGameState(input),
      'game-state.invariant.pending-operation-timeline',
    );
  });

  it('rejects inconsistent leaderboard sync ordering', () => {
    const baseInput = createFixtureGameStateInput();
    const input: GameStateInput = {
      ...baseInput,
      leaderboardSync: {
        lastSubmittedScore: 50,
        lastAckScore: 60,
        lastSubmitTs: 1_710_000_001_000,
      },
    };

    expectDomainErrorWithCode(
      () => createGameState(input),
      'game-state.invariant.leaderboard-ack-order',
    );
  });

  it('rejects leaderboard submitted score above allTimeScore', () => {
    const baseInput = createFixtureGameStateInput();
    const input: GameStateInput = {
      ...baseInput,
      allTimeScore: 100,
      leaderboardSync: {
        ...baseInput.leaderboardSync,
        lastSubmittedScore: 101,
        lastAckScore: 100,
      },
    };

    expectDomainErrorWithCode(
      () => createGameState(input),
      'game-state.invariant.leaderboard-submitted-score',
    );
  });

  it('rejects non-monotonic level status transition for the same level', () => {
    const previousBaseInput = createFixtureGameStateInput();
    const previousState = createGameState({
      ...previousBaseInput,
      currentLevelSession: {
        ...previousBaseInput.currentLevelSession,
        status: 'completed',
      },
    });
    const baseInput = createFixtureGameStateInput();
    const nextInput: GameStateInput = {
      ...baseInput,
      currentLevelSession: {
        ...baseInput.currentLevelSession,
        status: 'active',
      },
    };

    expectDomainErrorWithCode(
      () => createGameState(nextInput, { previousState }),
      'game-state.invariant.level-status-transition',
    );
  });

  it('rejects regression of found words within the same level transition', () => {
    const previousState = createGameState(createFixtureGameStateInput());
    const baseInput = createFixtureGameStateInput();
    const nextInput: GameStateInput = {
      ...baseInput,
      stateVersion: 1,
      updatedAt: baseInput.updatedAt + 1,
      currentLevelSession: {
        ...baseInput.currentLevelSession,
        foundTargets: [],
      },
    };

    expectDomainErrorWithCode(
      () => createGameState(nextInput, { previousState }),
      'game-state.invariant.found-targets-regression',
    );
  });

  it('rejects regression of stateVersion when previousState is provided', () => {
    const previousState = createGameState({
      ...createFixtureGameStateInput(),
      stateVersion: 10,
      updatedAt: 1_710_000_000_100,
    });
    const baseInput = createFixtureGameStateInput();
    const nextInput: GameStateInput = {
      ...baseInput,
      stateVersion: 9,
      updatedAt: 1_710_000_000_101,
      allTimeScore: previousState.allTimeScore + 1,
    };

    expectDomainErrorWithCode(
      () => createGameState(nextInput, { previousState }),
      'game-state.invariant.state-version-regression',
    );
  });

  it('allows reshuffling -> active transition only when level changes', () => {
    const previousBaseInput = createFixtureGameStateInput();
    const previousInput: GameStateInput = {
      ...previousBaseInput,
      currentLevelSession: {
        ...previousBaseInput.currentLevelSession,
        status: 'reshuffling',
      },
    };
    const previousState = createGameState(previousInput);

    const nextBaseInput = createFixtureGameStateInput();
    const nextInput: GameStateInput = {
      ...nextBaseInput,
      currentLevelSession: {
        ...nextBaseInput.currentLevelSession,
        levelId: 'level-43',
        status: 'active',
        foundTargets: [],
        foundBonuses: [],
      },
    };

    const nextState = createGameState(nextInput, { previousState });

    expect(nextState.currentLevelSession.levelId).toBe('level-43');
    expect(nextState.currentLevelSession.status).toBe('active');
  });
});
