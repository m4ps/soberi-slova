import { MODULE_IDS } from '../../shared/module-ids';
import { normalizeDictionaryWord } from './dictionary-pipeline';

export interface WordValidationRequest {
  readonly word: string;
  readonly targetWords: readonly string[];
  readonly foundWords: ReadonlySet<string>;
}

export type WordValidationResult = 'target' | 'bonus' | 'repeat' | 'invalid';

export interface WordValidationModule {
  readonly moduleName: typeof MODULE_IDS.wordValidation;
  validateWord: (request: WordValidationRequest) => WordValidationResult;
}

export function createWordValidationModule(
  dictionary: ReadonlySet<string> = new Set<string>(),
): WordValidationModule {
  return {
    moduleName: MODULE_IDS.wordValidation,
    validateWord: ({ word, targetWords, foundWords }) => {
      const normalizedWord = normalizeDictionaryWord(word);

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

export {
  buildDictionaryIndexFromCsv,
  DictionaryPipelineError,
  isValidNormalizedDictionaryWord,
  normalizeDictionaryWord,
  type DictionaryCsvPipelineResult,
  type DictionaryIndex,
  type DictionaryPipelineStats,
  type DictionaryRowRejectReason,
} from './dictionary-pipeline';
