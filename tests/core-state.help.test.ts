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
  it('applies hint progression for the easiest remaining target word', () => {
    const coreState = createCoreStateModule({
      initialGameState: createHelpFixtureState(),
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
      targetWord: 'дом',
      revealCount: 2,
      revealedLetters: 'до',
      revealedPathCells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    });
    expect(coreState.getSnapshot().gameState).toMatchObject({
      currentDisplayedTargetId: 'дом',
      currentHintPathProgress: 2,
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
      targetWord: 'дом',
      revealCount: 3,
      revealedLetters: 'дом',
    });
    expect(coreState.getSnapshot().gameState).toMatchObject({
      currentDisplayedTargetId: 'дом',
      currentHintPathProgress: 3,
    });

    coreState.submitPath(
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      5_003,
    );

    const switchedHint = coreState.applyHelp('hint', 'hint-op-3', 5_004);
    expect(switchedHint).toMatchObject({
      operationId: 'hint-op-3',
      kind: 'hint',
      applied: true,
      reason: 'applied',
      stateVersion: 4,
    });
    expect(switchedHint.effect).toMatchObject({
      kind: 'hint',
      targetWord: 'нос',
      revealCount: 2,
      revealedLetters: 'но',
    });
    expect(coreState.getSnapshot().gameState).toMatchObject({
      currentDisplayedTargetId: 'нос',
      currentHintPathProgress: 2,
    });
  });

  it('reshuffles level with full reset and enforces operation id idempotency', () => {
    const coreState = createCoreStateModule({
      initialGameState: createHelpFixtureState(),
      wordValidation: createWordValidationModule(new Set(createDefaultDictionaryWords())),
      nowProvider: () => 6_000,
    });

    coreState.submitPath(
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      6_001,
    );

    const reshuffle = coreState.applyHelp('reshuffle', 'reshuffle-op-1', 6_002);
    expect(reshuffle).toMatchObject({
      operationId: 'reshuffle-op-1',
      kind: 'reshuffle',
      applied: true,
      reason: 'applied',
      levelStatus: 'active',
      stateVersion: 3,
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

    const duplicateOperation = coreState.applyHelp('reshuffle', 'reshuffle-op-1', 6_003);
    expect(duplicateOperation).toMatchObject({
      operationId: 'reshuffle-op-1',
      kind: 'reshuffle',
      applied: false,
      reason: 'operation-already-applied',
      stateVersion: 3,
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
