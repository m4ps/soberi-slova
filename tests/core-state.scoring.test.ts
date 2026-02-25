import { describe, expect, it } from 'vitest';

import { createCoreStateModule } from '../src/domain/CoreState';
import type { GameStateInput } from '../src/domain/GameState';
import { createLevelGeneratorModule } from '../src/domain/LevelGenerator';
import {
  createRuntimeDictionaryResources,
  createWordValidationModule,
  type WordPathCellRef,
} from '../src/domain/WordValidation';

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

  it('credits target words from level session even when dictionary lookup set is narrower', () => {
    const coreState = createCoreStateModule({
      initialGameState: {
        ...createScoringFixtureState(),
        currentLevelSession: {
          ...createScoringFixtureState().currentLevelSession,
          levelId: 'level-target-priority',
          grid: [
            'д',
            'о',
            'р',
            'о',
            'г',
            'н',
            'о',
            'с',
            'к',
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
          targetWords: ['дорога', 'нос', 'лим'],
        },
      },
      wordValidation: createWordValidationModule(new Set(['дом', 'нос', 'сон'])),
      nowProvider: () => 5_000,
    });

    const targetSubmit = coreState.submitPath(
      [cell(0, 0), cell(0, 1), cell(0, 2), cell(0, 3), cell(0, 4), cell(1, 4)],
      5_001,
    );

    expect(targetSubmit).toMatchObject({
      result: 'target',
      normalizedWord: 'дорога',
      isSilent: false,
      levelClearAwarded: false,
      scoreDelta: {
        wordScore: 22,
        levelClearScore: 0,
        totalScore: 22,
      },
      progress: {
        foundTargets: 1,
        totalTargets: 3,
      },
      allTimeScore: 22,
      levelStatus: 'active',
    });
  });

  it('credits bonus words via dedicated dictionary lookup independent from level generation pool', () => {
    const runtimeDictionaryResources = createRuntimeDictionaryResources(
      [
        'id,bare,rank,type,level',
        '1,дом,10,noun,A1',
        '2,нос,20,noun,A1',
        '3,сон,30,noun,A1',
        '4,тон,40,noun,A2',
        '5,путь,50,noun,A2',
      ].join('\n'),
    );
    const generatorEntriesWithoutBonusWord =
      runtimeDictionaryResources.levelGeneratorEntries.filter(
        (entry) => entry.normalized !== 'тон',
      );

    const coreState = createCoreStateModule({
      initialGameState: createScoringFixtureState(),
      levelGenerator: createLevelGeneratorModule({
        dictionaryEntries: generatorEntriesWithoutBonusWord,
      }),
      wordValidation: createWordValidationModule(runtimeDictionaryResources.bonusLookupWords),
      nowProvider: () => 6_000,
    });

    const bonusSubmit = coreState.submitPath([cell(1, 0), cell(0, 1), cell(1, 1)], 6_001);
    expect(bonusSubmit).toMatchObject({
      result: 'bonus',
      normalizedWord: 'тон',
      isSilent: false,
      levelClearAwarded: false,
      scoreDelta: {
        wordScore: 5,
        levelClearScore: 0,
        totalScore: 5,
      },
      progress: {
        foundTargets: 0,
        totalTargets: 3,
      },
      allTimeScore: 5,
      levelStatus: 'active',
    });

    const repeatSubmit = coreState.submitPath([cell(1, 0), cell(0, 1), cell(1, 1)], 6_002);
    expect(repeatSubmit).toMatchObject({
      result: 'repeat',
      normalizedWord: 'тон',
      isSilent: true,
      scoreDelta: {
        wordScore: 0,
        levelClearScore: 0,
        totalScore: 0,
      },
      allTimeScore: 5,
      levelStatus: 'active',
    });
  });
});
