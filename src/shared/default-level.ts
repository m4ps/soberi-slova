export const DEFAULT_LEVEL_GRID = [
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
] as const;

export const DEFAULT_LEVEL_TARGET_WORDS = [
  'дом',
  'нос',
  'сон',
  'кора',
  'корм',
  'море',
  'нить',
  'нора',
  'путь',
  'роса',
] as const;

export const DEFAULT_LEVEL_PREFOUND_TARGET_WORDS = [
  'кора',
  'корм',
  'море',
  'нить',
  'нора',
  'путь',
  'роса',
] as const;

export const DEFAULT_LEVEL_REMAINING_TARGET_WORDS = ['дом', 'нос', 'сон'] as const;

export const DEFAULT_LEVEL_BONUS_DICTIONARY_WORDS = ['том', 'тон'] as const;

export const DEFAULT_LEVEL_DICTIONARY_WORDS = [
  ...DEFAULT_LEVEL_TARGET_WORDS,
  ...DEFAULT_LEVEL_BONUS_DICTIONARY_WORDS,
] as const;

export function cloneDefaultLevelGrid(): string[] {
  return [...DEFAULT_LEVEL_GRID];
}

export function cloneDefaultLevelTargetWords(): string[] {
  return [...DEFAULT_LEVEL_TARGET_WORDS];
}

export function cloneDefaultLevelPrefoundTargetWords(): string[] {
  return [...DEFAULT_LEVEL_PREFOUND_TARGET_WORDS];
}

export function cloneDefaultLevelDictionaryWords(): string[] {
  return [...DEFAULT_LEVEL_DICTIONARY_WORDS];
}
