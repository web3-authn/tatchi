import { AuthMenuMode } from './types';

export interface ProceedEligibilityArgs {
  mode: AuthMenuMode;
  currentValue: string;
  accountExists: boolean;
  secure: boolean;
}

export interface ProceedEligibilityResult {
  canShowContinue: boolean;
  canSubmit: boolean;
}

export function getProceedEligibility({
  mode,
  currentValue,
  accountExists,
  secure,
}: ProceedEligibilityArgs): ProceedEligibilityResult {
  const hasInput = currentValue.length > 0;
  if (mode === AuthMenuMode.Register) {
    return {
      canShowContinue: hasInput && !accountExists,
      canSubmit: hasInput && secure && !accountExists,
    };
  }
  if (mode === AuthMenuMode.Login) {
    return {
      canShowContinue: hasInput && accountExists,
      canSubmit: hasInput && accountExists,
    };
  }
  // Recover mode keeps the legacy behaviour of allowing empty input
  return { canShowContinue: true, canSubmit: true };
}

export function useProceedEligibility(args: {
  mode: AuthMenuMode;
  currentValue: string;
  accountExists: boolean;
  secure: boolean;
}) {
  return getProceedEligibility(args);
}

export default useProceedEligibility;
