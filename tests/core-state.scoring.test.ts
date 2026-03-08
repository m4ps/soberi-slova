import { describe, expect, it } from 'vitest';

import { createCoreStateModule } from '../src/domain/CoreState';
import type { GameStateInput } from '../src/domain/GameState';
import { createLevelGeneratorModule } from '../src/domain/LevelGenerator';
import {
  createRuntimeDictionaryResources,
  createWordValidationModule,
  type WordPathCellRef,
} from '../src/domain/WordValidation';
import {
  createDefaultDictionaryWords,
  createNearCompletionFixtureState,
} from './helpers/game-state-fixtures';

function cell(row: number, col: number): WordPathCellRef {
  return { row, col };
}

function createScoringFixtureState(): GameStateInput {
  return createNearCompletionFixtureState({
    levelId: 'level-scoring',
    source: 'test-fixture',
    seed: 7,
  });
}

describe('core state scoring/progression', () => {
  it('accepts out-of-focus target words without switching the displayed target prematurely', () => {
    const coreState = createCoreStateModule({
      initialGameState: {
        ...createScoringFixtureState(),
        currentDisplayedTargetId: 'дом',
        currentHintPathProgress: 2,
      },
      wordValidation: createWordValidationModule(new Set(createDefaultDictionaryWords())),
      nowProvider: () => 4_500,
    });

    const outOfFocusTarget = coreState.submitPath([cell(1, 3), cell(1, 2), cell(1, 1)], 4_501);

    expect(outOfFocusTarget).toMatchObject({
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
        foundTargets: 8,
        totalTargets: 10,
      },
      allTimeScore: 16,
      stateVersion: 1,
      levelStatus: 'active',
    });
    expect(outOfFocusTarget.wordSuccessOperationId).toEqual(expect.any(String));

    const pendingSnapshot = coreState.getSnapshot();
    expect(pendingSnapshot.gameplay).toMatchObject({
      isInputLocked: true,
      pendingWordSuccessOperationId: outOfFocusTarget.wordSuccessOperationId,
      progress: {
        foundTargets: 8,
        totalTargets: 10,
      },
      allTimeScore: 16,
      levelStatus: 'active',
      stateVersion: 1,
    });
    expect(pendingSnapshot.gameState).toMatchObject({
      currentDisplayedTargetId: 'дом',
      currentHintPathProgress: 2,
    });
    expect(pendingSnapshot.gameplay.foundTargets).toEqual([
      ...createScoringFixtureState().currentLevelSession.foundTargets,
      'сон',
    ]);

    const wordSuccessAck = coreState.acknowledgeWordSuccessAnimation(
      outOfFocusTarget.wordSuccessOperationId!,
      4_502,
    );
    expect(wordSuccessAck).toMatchObject({
      operationId: outOfFocusTarget.wordSuccessOperationId,
      handled: true,
      levelClearAwarded: false,
      scoreDelta: {
        wordScore: 0,
        levelClearScore: 0,
        totalScore: 0,
      },
      levelStatus: 'active',
      showEphemeralCongrats: false,
      allTimeScore: 16,
      stateVersion: 2,
    });

    expect(coreState.getSnapshot().gameState).toMatchObject({
      currentDisplayedTargetId: 'дом',
      currentHintPathProgress: 2,
    });
  });

  it('applies scoring formulas in state-first order and keeps accrual idempotent', () => {
    const coreState = createCoreStateModule({
      initialGameState: createScoringFixtureState(),
      wordValidation: createWordValidationModule(new Set(createDefaultDictionaryWords())),
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
        foundTargets: 8,
        totalTargets: 10,
      },
      allTimeScore: 16,
      stateVersion: 1,
      levelStatus: 'active',
    });
    expect(targetDom.wordSuccessOperationId).toEqual(expect.any(String));
    expect(coreState.getSnapshot().gameplay).toMatchObject({
      isInputLocked: true,
      pendingWordSuccessOperationId: targetDom.wordSuccessOperationId,
      stateVersion: 1,
    });
    expect(coreState.getSnapshot().gameState).toMatchObject({
      currentDisplayedTargetId: 'нос',
      currentHintPathProgress: 0,
    });

    const blockedDuringSuccessFeedback = coreState.submitPath(
      [cell(1, 0), cell(0, 1), cell(0, 2)],
      2_002,
    );
    expect(blockedDuringSuccessFeedback).toMatchObject({
      result: 'invalid',
      normalizedWord: 'том',
      isSilent: true,
      scoreDelta: {
        wordScore: 0,
        levelClearScore: 0,
        totalScore: 0,
      },
      allTimeScore: 16,
      stateVersion: 1,
      levelStatus: 'active',
    });

    const firstWordSuccessAck = coreState.acknowledgeWordSuccessAnimation(
      targetDom.wordSuccessOperationId!,
      2_003,
    );
    expect(firstWordSuccessAck).toMatchObject({
      operationId: targetDom.wordSuccessOperationId,
      handled: true,
      levelClearAwarded: false,
      scoreDelta: {
        wordScore: 0,
        levelClearScore: 0,
        totalScore: 0,
      },
      levelStatus: 'active',
      showEphemeralCongrats: false,
      allTimeScore: 16,
      stateVersion: 2,
    });

    const bonusTom = coreState.submitPath([cell(1, 0), cell(0, 1), cell(0, 2)], 2_004);
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
        foundTargets: 8,
        totalTargets: 10,
      },
      allTimeScore: 21,
      stateVersion: 3,
      levelStatus: 'active',
    });

    const repeatTom = coreState.submitPath([cell(1, 0), cell(0, 1), cell(0, 2)], 2_005);
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
      stateVersion: 3,
      levelStatus: 'active',
    });

    const targetNos = coreState.submitPath([cell(1, 1), cell(1, 2), cell(1, 3)], 2_006);
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
        foundTargets: 9,
        totalTargets: 10,
      },
      allTimeScore: 37,
      stateVersion: 4,
      levelStatus: 'active',
    });
    expect(targetNos.wordSuccessOperationId).toEqual(expect.any(String));
    expect(coreState.getSnapshot().gameplay).toMatchObject({
      isInputLocked: true,
      pendingWordSuccessOperationId: targetNos.wordSuccessOperationId,
      stateVersion: 4,
    });

    const secondWordSuccessAck = coreState.acknowledgeWordSuccessAnimation(
      targetNos.wordSuccessOperationId!,
      2_007,
    );
    expect(secondWordSuccessAck).toMatchObject({
      operationId: targetNos.wordSuccessOperationId,
      handled: true,
      levelClearAwarded: false,
      scoreDelta: {
        wordScore: 0,
        levelClearScore: 0,
        totalScore: 0,
      },
      levelStatus: 'active',
      showEphemeralCongrats: false,
      allTimeScore: 37,
      stateVersion: 5,
    });

    const finalTarget = coreState.submitPath([cell(1, 3), cell(1, 2), cell(1, 1)], 2_008);
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
        foundTargets: 10,
        totalTargets: 10,
      },
      allTimeScore: 53,
      stateVersion: 6,
      levelStatus: 'completed',
    });
    expect(finalTarget.wordSuccessOperationId).toEqual(expect.any(String));

    const blockedBonusAfterCompletion = coreState.submitPath(
      [cell(1, 0), cell(0, 1), cell(1, 1)],
      2_009,
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
        foundTargets: 10,
        totalTargets: 10,
      },
      allTimeScore: 53,
      stateVersion: 6,
      levelStatus: 'completed',
    });

    const wordSuccessOperationId = finalTarget.wordSuccessOperationId;
    expect(wordSuccessOperationId).not.toBeNull();

    const levelClearAck = coreState.acknowledgeWordSuccessAnimation(wordSuccessOperationId!, 2_010);
    expect(levelClearAck).toMatchObject({
      operationId: wordSuccessOperationId,
      handled: true,
      levelClearAwarded: true,
      scoreDelta: {
        wordScore: 0,
        levelClearScore: 80,
        totalScore: 80,
      },
      levelStatus: 'reshuffling',
      showEphemeralCongrats: true,
      allTimeScore: 133,
      stateVersion: 7,
    });
    expect(levelClearAck.levelTransitionOperationId).toEqual(expect.any(String));

    const duplicateLevelClearAck = coreState.acknowledgeWordSuccessAnimation(
      wordSuccessOperationId!,
      2_011,
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
      allTimeScore: 133,
      stateVersion: 7,
    });

    const blockedInputDuringTransition = coreState.submitPath(
      [cell(1, 0), cell(0, 1), cell(1, 1)],
      2_012,
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
      allTimeScore: 133,
      stateVersion: 7,
      levelStatus: 'reshuffling',
    });

    const levelTransitionOperationId = levelClearAck.levelTransitionOperationId;
    expect(levelTransitionOperationId).not.toBeNull();

    const transitionAck = coreState.acknowledgeLevelTransitionDone(
      levelTransitionOperationId!,
      2_013,
    );
    expect(transitionAck).toMatchObject({
      operationId: levelTransitionOperationId,
      handled: true,
      transitionedToNextLevel: true,
      levelStatus: 'active',
      allTimeScore: 133,
      stateVersion: 8,
    });
    expect(transitionAck.levelId).not.toBe('level-scoring');

    const duplicateTransitionAck = coreState.acknowledgeLevelTransitionDone(
      levelTransitionOperationId!,
      2_014,
    );
    expect(duplicateTransitionAck).toMatchObject({
      operationId: levelTransitionOperationId,
      handled: false,
      transitionedToNextLevel: false,
      allTimeScore: 133,
      stateVersion: 8,
    });

    const snapshot = coreState.getSnapshot();
    expect(snapshot.gameplay).toMatchObject({
      allTimeScore: 133,
      progress: {
        foundTargets: 0,
      },
      levelStatus: 'active',
      stateVersion: 8,
      isInputLocked: false,
      showEphemeralCongrats: false,
    });
    expect(snapshot.gameplay.progress.totalTargets).toBeGreaterThanOrEqual(10);
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
          targetWords: [
            'дом',
            'нос',
            'сон',
            'литр',
            'мрак',
            'нить',
            'плод',
            'путь',
            'река',
            'дорога',
          ],
          foundTargets: [],
          foundBonuses: [],
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
        totalTargets: 10,
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
        foundTargets: 7,
        totalTargets: 10,
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
