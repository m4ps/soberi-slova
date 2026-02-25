import { MODULE_IDS } from '../../shared/module-ids';

export interface LevelGenerationRequest {
  readonly seed: number;
}

export interface GeneratedLevelStub {
  readonly seed: number;
  readonly gridSize: 5;
  readonly targetWords: readonly string[];
}

export interface LevelGeneratorModule {
  readonly moduleName: typeof MODULE_IDS.levelGenerator;
  generateLevel: (request: LevelGenerationRequest) => GeneratedLevelStub;
}

export function createLevelGeneratorModule(): LevelGeneratorModule {
  return {
    moduleName: MODULE_IDS.levelGenerator,
    generateLevel: ({ seed }) => ({
      seed,
      gridSize: 5,
      targetWords: [],
    }),
  };
}
