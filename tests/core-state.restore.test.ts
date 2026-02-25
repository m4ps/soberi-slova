import { describe, expect, it } from 'vitest';

import { createCoreStateModule } from '../src/domain/CoreState';
import type { GameStateInput } from '../src/domain/GameState';

function createRestoreFixtureState(): GameStateInput {
  return {
    schemaVersion: 2,
    stateVersion: 0,
    updatedAt: 1_000,
    allTimeScore: 0,
    currentLevelSession: {
      levelId: 'level-restore',
      grid: [
        'д',
        'о',
        'м',
        'к',
        'о',
        'т',
        'н',
        'о',
        'с',
        'а',
        'л',
        'и',
        'м',
        'р',
        'е',
        'п',
        'у',
        'т',
        'ь',
        'я',
        'б',
        'в',
        'г',
        'ё',
        'ж',
      ],
      targetWords: ['дом', 'нос', 'сон'],
      foundTargets: [],
      foundBonuses: [],
      status: 'active',
      seed: 17,
      meta: {
        source: 'restore-test',
      },
    },
    helpWindow: {
      windowStartTs: 1_000,
      freeActionAvailable: true,
      pendingHelpRequest: null,
    },
    pendingOps: [],
    leaderboardSync: {
      lastSubmittedScore: 0,
      lastAckScore: 0,
      lastSubmitTs: 0,
    },
  };
}

describe('core state restore session', () => {
  it('merges local/cloud snapshots using LWW and restores active level', () => {
    const localState: GameStateInput = {
      ...createRestoreFixtureState(),
      stateVersion: 4,
      updatedAt: 5_000,
      allTimeScore: 80,
      currentLevelSession: {
        ...createRestoreFixtureState().currentLevelSession,
        levelId: 'level-local',
      },
    };
    const cloudState: GameStateInput = {
      ...createRestoreFixtureState(),
      stateVersion: 5,
      updatedAt: 6_000,
      allTimeScore: 95,
      currentLevelSession: {
        ...createRestoreFixtureState().currentLevelSession,
        levelId: 'level-cloud',
      },
    };
    const coreState = createCoreStateModule({
      initialGameState: createRestoreFixtureState(),
      nowProvider: () => 10_000,
    });

    const restoreResult = coreState.restoreSession(
      {
        localSnapshot: {
          gameStateSerialized: JSON.stringify(localState),
        },
        cloudSnapshot: {
          gameStateSerialized: JSON.stringify(cloudState),
        },
        cloudAllTimeScore: 90,
      },
      10_000,
    );

    expect(restoreResult).toMatchObject({
      restored: true,
      levelRestored: true,
      source: 'cloud',
      allTimeScore: 95,
      levelId: 'level-cloud',
    });
    const snapshot = coreState.getSnapshot();
    expect(snapshot.gameplay).toMatchObject({
      levelId: 'level-cloud',
      allTimeScore: 95,
      levelStatus: 'active',
    });
  });

  it('falls back to a fresh active level when restored level is not restorable', () => {
    const notRestorableState: GameStateInput = {
      ...createRestoreFixtureState(),
      stateVersion: 8,
      updatedAt: 7_000,
      allTimeScore: 120,
      currentLevelSession: {
        ...createRestoreFixtureState().currentLevelSession,
        levelId: 'level-completed',
        status: 'completed',
      },
      pendingOps: [
        {
          operationId: 'op-word-success-1',
          kind: 'word-success-animation',
          status: 'pending',
          retryCount: 0,
          createdAt: 6_900,
          updatedAt: 7_000,
        },
      ],
    };
    const coreState = createCoreStateModule({
      initialGameState: createRestoreFixtureState(),
      nowProvider: () => 11_000,
    });

    const restoreResult = coreState.restoreSession(
      {
        localSnapshot: {
          gameStateSerialized: JSON.stringify(notRestorableState),
        },
        cloudSnapshot: null,
        cloudAllTimeScore: 130,
      },
      11_000,
    );

    expect(restoreResult).toMatchObject({
      restored: true,
      levelRestored: false,
      source: 'local',
      allTimeScore: 130,
    });
    expect(restoreResult.levelId).not.toBe('level-completed');
    const snapshot = coreState.getSnapshot();
    expect(snapshot.gameplay).toMatchObject({
      allTimeScore: 130,
      levelStatus: 'active',
    });
    expect(snapshot.gameState.pendingOps).toEqual([]);
  });
});
