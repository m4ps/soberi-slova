import { describe, expect, it } from 'vitest';

import { createCoreStateModule } from '../src/domain/CoreState';
import type { GameStateInput } from '../src/domain/GameState';
import { createWordValidationModule, type WordPathCellRef } from '../src/domain/WordValidation';

function cell(row: number, col: number): WordPathCellRef {
  return { row, col };
}

function createScoringFixtureState(): GameStateInput {
  return {
    schemaVersion: 2,
    stateVersion: 0,
    updatedAt: 1_000,
    allTimeScore: 0,
    currentLevelSession: {
      levelId: 'level-scoring',
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
      seed: 7,
      meta: {
        source: 'test-fixture',
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

describe('core state scoring/progression', () => {
  it('applies scoring formulas in state-first order and keeps accrual idempotent', () => {
    const coreState = createCoreStateModule({
      initialGameState: createScoringFixtureState(),
      wordValidation: createWordValidationModule(new Set(['дом', 'нос', 'сон', 'том', 'тон'])),
      nowProvider: () => 2_000,
    });

    const targetDom = coreState.submitPath([cell(0, 0), cell(0, 1), cell(0, 2)], 2_001);
    expect(targetDom).toMatchObject({
      result: 'target',
      normalizedWord: 'дом',
      isSilent: false,
      levelClearAwarded: false,
      scoreDelta: {
        wordScore: 16,
        levelClearScore: 0,
        totalScore: 16,
      },
      progress: {
        foundTargets: 1,
        totalTargets: 3,
      },
      allTimeScore: 16,
      stateVersion: 1,
      levelStatus: 'active',
    });

    const bonusTom = coreState.submitPath([cell(1, 0), cell(0, 1), cell(0, 2)], 2_002);
    expect(bonusTom).toMatchObject({
      result: 'bonus',
      normalizedWord: 'том',
      isSilent: false,
      scoreDelta: {
        wordScore: 5,
        levelClearScore: 0,
        totalScore: 5,
      },
      progress: {
        foundTargets: 1,
        totalTargets: 3,
      },
      allTimeScore: 21,
      stateVersion: 2,
      levelStatus: 'active',
    });

    const repeatTom = coreState.submitPath([cell(1, 0), cell(0, 1), cell(0, 2)], 2_003);
    expect(repeatTom).toMatchObject({
      result: 'repeat',
      normalizedWord: 'том',
      isSilent: true,
      scoreDelta: {
        wordScore: 0,
        levelClearScore: 0,
        totalScore: 0,
      },
      allTimeScore: 21,
      stateVersion: 2,
      levelStatus: 'active',
    });

    const targetNos = coreState.submitPath([cell(1, 1), cell(1, 2), cell(1, 3)], 2_004);
    expect(targetNos).toMatchObject({
      result: 'target',
      normalizedWord: 'нос',
      isSilent: false,
      levelClearAwarded: false,
      scoreDelta: {
        wordScore: 16,
        levelClearScore: 0,
        totalScore: 16,
      },
      progress: {
        foundTargets: 2,
        totalTargets: 3,
      },
      allTimeScore: 37,
      stateVersion: 3,
      levelStatus: 'active',
    });

    const finalTarget = coreState.submitPath([cell(1, 3), cell(1, 2), cell(1, 1)], 2_005);
    expect(finalTarget).toMatchObject({
      result: 'target',
      normalizedWord: 'сон',
      isSilent: false,
      levelClearAwarded: true,
      scoreDelta: {
        wordScore: 16,
        levelClearScore: 45,
        totalScore: 61,
      },
      progress: {
        foundTargets: 3,
        totalTargets: 3,
      },
      allTimeScore: 98,
      stateVersion: 4,
      levelStatus: 'completed',
    });

    const blockedBonusAfterCompletion = coreState.submitPath(
      [cell(1, 0), cell(0, 1), cell(1, 1)],
      2_006,
    );
    expect(blockedBonusAfterCompletion).toMatchObject({
      result: 'invalid',
      normalizedWord: 'тон',
      isSilent: true,
      scoreDelta: {
        wordScore: 0,
        levelClearScore: 0,
        totalScore: 0,
      },
      progress: {
        foundTargets: 3,
        totalTargets: 3,
      },
      allTimeScore: 98,
      stateVersion: 4,
      levelStatus: 'completed',
    });

    const snapshot = coreState.getSnapshot();
    expect(snapshot.gameplay).toMatchObject({
      allTimeScore: 98,
      progress: {
        foundTargets: 3,
        totalTargets: 3,
      },
      levelStatus: 'completed',
      stateVersion: 4,
    });
    expect(snapshot.gameplay.foundTargets).toEqual(['дом', 'нос', 'сон']);
    expect(snapshot.gameplay.foundBonuses).toEqual(['том']);
    expect(snapshot.gameState.currentLevelSession.foundTargets).toEqual(['дом', 'нос', 'сон']);
    expect(snapshot.gameState.currentLevelSession.foundBonuses).toEqual(['том']);
  });
});
