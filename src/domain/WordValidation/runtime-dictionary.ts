import type { WordEntry } from '../GameState';
import { buildDictionaryIndexFromCsv, type DictionaryPipelineStats } from './dictionary-pipeline';

export interface RuntimeDictionaryResources {
  readonly bonusLookupWords: ReadonlySet<string>;
  readonly levelGeneratorEntries: readonly WordEntry[];
  readonly stats: DictionaryPipelineStats;
}

export function createRuntimeDictionaryResources(csvContent: string): RuntimeDictionaryResources {
  const { index, stats } = buildDictionaryIndexFromCsv(csvContent);
  const levelGeneratorEntries: WordEntry[] = [];

  for (const normalizedWord of index.normalizedWords) {
    const entry = index.getEntryByNormalizedWord(normalizedWord);
    if (entry) {
      levelGeneratorEntries.push(entry);
    }
  }

  return {
    bonusLookupWords: new Set(index.normalizedWords),
    levelGeneratorEntries,
    stats,
  };
}
