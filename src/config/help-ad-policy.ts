export type HelpAdOutcome = 'reward' | 'close' | 'error' | 'no-fill';

export type HelpAdTechnicalErrorPolicy =
  | 'deterministic-reject-with-toast-and-cooldown'
  | 'deterministic-goodwill';

export interface HelpAdOutcomePolicy {
  readonly outcome: HelpAdOutcome;
  readonly applyHelp: boolean;
  readonly applyCooldown: boolean;
  readonly toastMessage: string | null;
  readonly technicalErrorPolicy: HelpAdTechnicalErrorPolicy | null;
}

export const HELP_AD_NO_FILL_TOAST_MESSAGE = 'Реклама сейчас недоступна';
export const HELP_AD_GENERIC_FAILURE_TOAST_MESSAGE = 'Не удалось показать рекламу';
export const HELP_AD_TECHNICAL_ERROR_POLICY: HelpAdTechnicalErrorPolicy =
  'deterministic-reject-with-toast-and-cooldown';

const HELP_AD_OUTCOME_POLICIES = {
  reward: {
    outcome: 'reward',
    applyHelp: true,
    applyCooldown: false,
    toastMessage: null,
    technicalErrorPolicy: null,
  },
  close: {
    outcome: 'close',
    applyHelp: false,
    applyCooldown: true,
    toastMessage: HELP_AD_GENERIC_FAILURE_TOAST_MESSAGE,
    technicalErrorPolicy: null,
  },
  error: {
    outcome: 'error',
    applyHelp: false,
    applyCooldown: true,
    toastMessage: HELP_AD_GENERIC_FAILURE_TOAST_MESSAGE,
    technicalErrorPolicy: HELP_AD_TECHNICAL_ERROR_POLICY,
  },
  'no-fill': {
    outcome: 'no-fill',
    applyHelp: false,
    applyCooldown: true,
    toastMessage: HELP_AD_NO_FILL_TOAST_MESSAGE,
    technicalErrorPolicy: null,
  },
} satisfies Record<HelpAdOutcome, HelpAdOutcomePolicy>;

export function resolveHelpAdOutcomePolicy(
  outcome: HelpAdOutcome | undefined,
): HelpAdOutcomePolicy | null {
  if (outcome === undefined) {
    return null;
  }

  return HELP_AD_OUTCOME_POLICIES[outcome];
}
