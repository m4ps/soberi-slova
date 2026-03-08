import { describe, expect, it } from 'vitest';

import { createCoreStateModule } from '../src/domain/CoreState';
import type { GameStateInput } from '../src/domain/GameState';
import { createWordValidationModule } from '../src/domain/WordValidation';
import {
  createDefaultDictionaryWords,
  createNearCompletionFixtureState,
} from './helpers/game-state-fixtures';

function createHelpFixtureState(levelStatus: 'active' | 'completed' = 'active'): GameStateInput {
  const state = createNearCompletionFixtureState({
    levelId: 'level-help',
    source: 'help-test',
    seed: 31,
  });

  return {
    ...state,
    currentLevelSession: {
      ...state.currentLevelSession,
      status: levelStatus,
    },
  };
}

describe('core state help actions', () => {
  it('advances hint progression only for the current displayed target', () => {
    const coreState = createCoreStateModule({
      initialGameState: {
        ...createHelpFixtureState(),
        currentDisplayedTargetId: 'сон',
      },
      wordValidation: createWordValidationModule(new Set(createDefaultDictionaryWords())),
      nowProvider: () => 5_000,
    });

    const firstHint = coreState.applyHelp('hint', 'hint-op-1', 5_001);
    expect(firstHint).toMatchObject({
      operationId: 'hint-op-1',
      kind: 'hint',
      applied: true,
      reason: 'applied',
      levelId: 'level-help',
      stateVersion: 1,
    });
    expect(firstHint.effect).toMatchObject({
      kind: 'hint',
      targetWord: 'сон',
      revealCount: 1,
      revealedLetters: 'с',
      revealedPathCells: [{ row: 1, col: 3 }],
    });
    expect(coreState.getSnapshot().gameState).toMatchObject({
      currentDisplayedTargetId: 'сон',
      currentHintPathProgress: 1,
    });

    const secondHint = coreState.applyHelp('hint', 'hint-op-2', 5_002);
    expect(secondHint).toMatchObject({
      operationId: 'hint-op-2',
      kind: 'hint',
      applied: true,
      reason: 'applied',
      stateVersion: 2,
    });
    expect(secondHint.effect).toMatchObject({
      kind: 'hint',
      targetWord: 'сон',
      revealCount: 2,
      revealedLetters: 'со',
      revealedPathCells: [
        { row: 1, col: 3 },
        { row: 1, col: 2 },
      ],
    });
    expect(coreState.getSnapshot().gameState).toMatchObject({
      currentDisplayedTargetId: 'сон',
      currentHintPathProgress: 2,
    });

    const thirdHint = coreState.applyHelp('hint', 'hint-op-3', 5_003);
    expect(thirdHint).toMatchObject({
      operationId: 'hint-op-3',
      kind: 'hint',
      applied: true,
      reason: 'applied',
      stateVersion: 3,
    });
    expect(thirdHint.effect).toMatchObject({
      kind: 'hint',
      targetWord: 'сон',
      revealCount: 3,
      revealedLetters: 'сон',
      revealedPathCells: [
        { row: 1, col: 3 },
        { row: 1, col: 2 },
        { row: 1, col: 1 },
      ],
    });
    expect(coreState.getSnapshot().gameState).toMatchObject({
      currentDisplayedTargetId: 'сон',
      currentHintPathProgress: 3,
    });
    expect(coreState.getSnapshot().gameplay.foundTargets).toEqual(
      createHelpFixtureState().currentLevelSession.foundTargets,
    );

    const exhaustedHint = coreState.applyHelp('hint', 'hint-op-exhausted', 5_004);
    expect(exhaustedHint).toMatchObject({
      operationId: 'hint-op-exhausted',
      kind: 'hint',
      applied: false,
      reason: 'hint-path-complete',
      stateVersion: 3,
    });

    const submitResult = coreState.submitPath(
      [
        { row: 1, col: 3 },
        { row: 1, col: 2 },
        { row: 1, col: 1 },
      ],
      5_005,
    );
    expect(submitResult.wordSuccessOperationId).toEqual(expect.any(String));

    const blockedHintDuringSuccessFeedback = coreState.applyHelp('hint', 'hint-op-blocked', 5_006);
    expect(blockedHintDuringSuccessFeedback).toMatchObject({
      operationId: 'hint-op-blocked',
      kind: 'hint',
      applied: false,
      reason: 'success-feedback-pending',
      stateVersion: 4,
    });

    const wordSuccessAck = coreState.acknowledgeWordSuccessAnimation(
      submitResult.wordSuccessOperationId!,
      5_007,
    );
    expect(wordSuccessAck).toMatchObject({
      operationId: submitResult.wordSuccessOperationId,
      handled: true,
      levelClearAwarded: false,
      levelStatus: 'active',
      stateVersion: 5,
    });

    const switchedHint = coreState.applyHelp('hint', 'hint-op-4', 5_008);
    expect(switchedHint).toMatchObject({
      operationId: 'hint-op-4',
      kind: 'hint',
      applied: true,
      reason: 'applied',
      stateVersion: 6,
    });
    expect(switchedHint.effect).toMatchObject({
      kind: 'hint',
      targetWord: 'дом',
      revealCount: 1,
      revealedLetters: 'д',
    });
    expect(coreState.getSnapshot().gameState).toMatchObject({
      currentDisplayedTargetId: 'дом',
      currentHintPathProgress: 1,
    });
  });

  it('reshuffles level with full reset and enforces operation id idempotency', () => {
    const coreState = createCoreStateModule({
      initialGameState: {
        ...createHelpFixtureState(),
        currentDisplayedTargetId: 'нос',
        currentHintPathProgress: 1,
      },
      wordValidation: createWordValidationModule(new Set(createDefaultDictionaryWords())),
      nowProvider: () => 6_000,
    });

    const submitResult = coreState.submitPath(
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      6_001,
    );
    expect(submitResult.wordSuccessOperationId).toEqual(expect.any(String));

    const blockedReshuffleDuringSuccessFeedback = coreState.applyHelp(
      'reshuffle',
      'reshuffle-op-blocked',
      6_002,
    );
    expect(blockedReshuffleDuringSuccessFeedback).toMatchObject({
      operationId: 'reshuffle-op-blocked',
      kind: 'reshuffle',
      applied: false,
      reason: 'success-feedback-pending',
      stateVersion: 1,
    });

    const wordSuccessAck = coreState.acknowledgeWordSuccessAnimation(
      submitResult.wordSuccessOperationId!,
      6_003,
    );
    expect(wordSuccessAck).toMatchObject({
      operationId: submitResult.wordSuccessOperationId,
      handled: true,
      levelClearAwarded: false,
      levelStatus: 'active',
      stateVersion: 2,
    });
    expect(coreState.getSnapshot().gameState).toMatchObject({
      currentDisplayedTargetId: 'нос',
      currentHintPathProgress: 1,
    });

    const reshuffle = coreState.applyHelp('reshuffle', 'reshuffle-op-1', 6_004);
    expect(reshuffle).toMatchObject({
      operationId: 'reshuffle-op-1',
      kind: 'reshuffle',
      applied: true,
      reason: 'applied',
      levelStatus: 'active',
      stateVersion: 4,
    });
    expect(reshuffle.effect).toMatchObject({
      kind: 'reshuffle',
      previousLevelId: 'level-help',
      nextSeed: expect.any(Number),
    });

    const snapshot = coreState.getSnapshot();
    expect(snapshot.gameplay.levelId).toContain('reshuffle');
    expect(snapshot.gameplay.foundTargets).toHaveLength(0);
    expect(snapshot.gameplay.foundBonuses).toHaveLength(0);
    expect(snapshot.gameplay.progress.foundTargets).toBe(0);
    expect(snapshot.gameState.currentDisplayedTargetId).toBeTruthy();
    expect(snapshot.gameState.currentHintPathProgress).toBe(0);

    const duplicateOperation = coreState.applyHelp('reshuffle', 'reshuffle-op-1', 6_005);
    expect(duplicateOperation).toMatchObject({
      operationId: 'reshuffle-op-1',
      kind: 'reshuffle',
      applied: false,
      reason: 'operation-already-applied',
      stateVersion: 4,
    });
  });

  it('rejects help effects when level is not active', () => {
    const coreState = createCoreStateModule({
      initialGameState: createHelpFixtureState('completed'),
    });

    const result = coreState.applyHelp('hint', 'hint-op-locked', 7_000);
    expect(result).toMatchObject({
      operationId: 'hint-op-locked',
      kind: 'hint',
      applied: false,
      reason: 'level-not-active',
      levelStatus: 'completed',
      stateVersion: 0,
    });
  });
});
