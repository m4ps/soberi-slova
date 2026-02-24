export interface LevelGenerationRequest {
  readonly seed: number;
}

export interface GeneratedLevelStub {
  readonly seed: number;
  readonly gridSize: 5;
  readonly targetWords: readonly string[];
}

export interface LevelGeneratorModule {
  readonly moduleName: 'LevelGenerator';
  generateLevel: (request: LevelGenerationRequest) => GeneratedLevelStub;
}

export function createLevelGeneratorModule(): LevelGeneratorModule {
  return {
    moduleName: 'LevelGenerator',
    generateLevel: ({ seed }) => ({
      seed,
      gridSize: 5,
      targetWords: [],
    }),
  };
}
