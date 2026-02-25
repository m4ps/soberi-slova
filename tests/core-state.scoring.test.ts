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
      levelClearAwarded: false,
      scoreDelta: {
        wordScore: 16,
        levelClearScore: 0,
        totalScore: 16,
      },
      progress: {
        foundTargets: 3,
        totalTargets: 3,
      },
      allTimeScore: 53,
      stateVersion: 4,
      levelStatus: 'completed',
    });
    expect(finalTarget.wordSuccessOperationId).toEqual(expect.any(String));

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
      allTimeScore: 53,
      stateVersion: 4,
      levelStatus: 'completed',
    });

    const wordSuccessOperationId = finalTarget.wordSuccessOperationId;
    expect(wordSuccessOperationId).not.toBeNull();

    const levelClearAck = coreState.acknowledgeWordSuccessAnimation(wordSuccessOperationId!, 2_007);
    expect(levelClearAck).toMatchObject({
      operationId: wordSuccessOperationId,
      handled: true,
      levelClearAwarded: true,
      scoreDelta: {
        wordScore: 0,
        levelClearScore: 45,
        totalScore: 45,
      },
      levelStatus: 'reshuffling',
      showEphemeralCongrats: true,
      allTimeScore: 98,
      stateVersion: 5,
    });
    expect(levelClearAck.levelTransitionOperationId).toEqual(expect.any(String));

    const duplicateLevelClearAck = coreState.acknowledgeWordSuccessAnimation(
      wordSuccessOperationId!,
      2_008,
    );
    expect(duplicateLevelClearAck).toMatchObject({
      operationId: wordSuccessOperationId,
      handled: false,
      levelClearAwarded: false,
      scoreDelta: {
        wordScore: 0,
        levelClearScore: 0,
        totalScore: 0,
      },
      levelStatus: 'reshuffling',
      allTimeScore: 98,
      stateVersion: 5,
    });

    const blockedInputDuringTransition = coreState.submitPath(
      [cell(1, 0), cell(0, 1), cell(1, 1)],
      2_009,
    );
    expect(blockedInputDuringTransition).toMatchObject({
      result: 'invalid',
      normalizedWord: 'тон',
      isSilent: true,
      scoreDelta: {
        wordScore: 0,
        levelClearScore: 0,
        totalScore: 0,
      },
      allTimeScore: 98,
      stateVersion: 5,
      levelStatus: 'reshuffling',
    });

    const levelTransitionOperationId = levelClearAck.levelTransitionOperationId;
    expect(levelTransitionOperationId).not.toBeNull();

    const transitionAck = coreState.acknowledgeLevelTransitionDone(
      levelTransitionOperationId!,
      2_010,
    );
    expect(transitionAck).toMatchObject({
      operationId: levelTransitionOperationId,
      handled: true,
      transitionedToNextLevel: true,
      levelStatus: 'active',
      allTimeScore: 98,
      stateVersion: 6,
    });
    expect(transitionAck.levelId).not.toBe('level-scoring');

    const duplicateTransitionAck = coreState.acknowledgeLevelTransitionDone(
      levelTransitionOperationId!,
      2_011,
    );
    expect(duplicateTransitionAck).toMatchObject({
      operationId: levelTransitionOperationId,
      handled: false,
      transitionedToNextLevel: false,
      allTimeScore: 98,
      stateVersion: 6,
    });

    const snapshot = coreState.getSnapshot();
    expect(snapshot.gameplay).toMatchObject({
      allTimeScore: 98,
      progress: {
        foundTargets: 0,
      },
      levelStatus: 'active',
      stateVersion: 6,
      isInputLocked: false,
      showEphemeralCongrats: false,
    });
    expect(snapshot.gameplay.progress.totalTargets).toBeGreaterThanOrEqual(3);
    expect(snapshot.gameplay.foundTargets).toEqual([]);
    expect(snapshot.gameplay.foundBonuses).toEqual([]);
    expect(snapshot.gameplay.pendingWordSuccessOperationId).toBeNull();
    expect(snapshot.gameplay.pendingLevelTransitionOperationId).toBeNull();
    expect(snapshot.gameState.currentLevelSession.foundTargets).toEqual([]);
    expect(snapshot.gameState.currentLevelSession.foundBonuses).toEqual([]);
  });
});
