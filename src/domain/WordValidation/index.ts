export interface WordValidationRequest {
  readonly word: string;
  readonly targetWords: readonly string[];
  readonly foundWords: ReadonlySet<string>;
}

export type WordValidationResult = 'target' | 'bonus' | 'repeat' | 'invalid';

export interface WordValidationModule {
  readonly moduleName: 'WordValidation';
  validateWord: (request: WordValidationRequest) => WordValidationResult;
}

export function createWordValidationModule(
  dictionary: ReadonlySet<string> = new Set<string>(),
): WordValidationModule {
  return {
    moduleName: 'WordValidation',
    validateWord: ({ word, targetWords, foundWords }) => {
      const normalizedWord = word.trim().toLowerCase();

      if (!normalizedWord || !dictionary.has(normalizedWord)) {
        return 'invalid';
      }

      if (foundWords.has(normalizedWord)) {
        return 'repeat';
      }

      if (targetWords.includes(normalizedWord)) {
        return 'target';
      }

      return 'bonus';
    },
  };
}
