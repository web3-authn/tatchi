import { AuthMenuMode } from '.';

export function useProceedEligibility({
  mode,
  currentValue,
  accountExists,
  secure,
}: {
  mode: AuthMenuMode;
  currentValue: string;
  accountExists: boolean;
  secure: boolean;
}) {
  const canShowContinue = mode === 'register'
    ? (currentValue.length > 0 && !accountExists)
    : mode === 'login'
    ? (currentValue.length > 0 && !!accountExists)
    : (currentValue.trim().length > 0);

  const canSubmit = mode === 'register'
    ? (currentValue.length > 0 && secure && !accountExists)
    : mode === 'login'
    ? (currentValue.length > 0 && !!accountExists)
    : (currentValue.trim().length > 0);

  return { canShowContinue, canSubmit };
}

export default useProceedEligibility;

