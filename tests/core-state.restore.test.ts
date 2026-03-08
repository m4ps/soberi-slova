import { describe, expect, it } from 'vitest';

import { createCoreStateModule } from '../src/domain/CoreState';
import { calculateReadabilityScore, type GameStateInput } from '../src/domain/GameState';
import { createNearCompletionFixtureState } from './helpers/game-state-fixtures';

function createRestoreFixtureState(): GameStateInput {
  return createNearCompletionFixtureState({
    levelId: 'level-restore',
    source: 'restore-test',
    seed: 17,
    schemaVersion: 2,
    meta: {
      hintTargetWord: 'сон',
      hintRevealCount: 2,
    },
  });
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
    expect(snapshot.gameState).toMatchObject({
      currentDisplayedTargetId: 'сон',
      currentHintPathProgress: 2,
    });
    expect(snapshot.gameState.currentLevelSession.readabilityScore).toBe(
      calculateReadabilityScore(createRestoreFixtureState().currentLevelSession.targetWords),
    );
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
    expect(snapshot.gameState.currentDisplayedTargetId).toBeTruthy();
    expect(snapshot.gameState.currentHintPathProgress).toBe(0);
  });
});
