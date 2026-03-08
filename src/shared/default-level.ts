export const DEFAULT_LEVEL_GRID = [
  'д',
  'о',
  'м',
  'к',
  'о',
  'ц',
  'т',
  'н',
  'о',
  'с',
  'а',
  'ш',
  'а',
  'и',
  'л',
  'р',
  'е',
  'б',
  'п',
  'у',
  'т',
  'я',
  'е',
  'ж',
  'а',
  'а',
  'н',
  'с',
  'к',
  'г',
  'ч',
  'р',
  'у',
  'и',
  'о',
  'в',
] as const;

export const DEFAULT_LEVEL_TARGET_WORDS = [
  'дом',
  'нос',
  'сон',
  'нора',
  'карта',
  'парус',
  'берег',
  'картина',
  'парусник',
  'берегов',
] as const;

export const DEFAULT_LEVEL_PREFOUND_TARGET_WORDS = [
  'нора',
  'карта',
  'парус',
  'берег',
  'картина',
  'парусник',
  'берегов',
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
