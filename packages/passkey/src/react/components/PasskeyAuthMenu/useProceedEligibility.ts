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
    : true; // In recover mode, show Continue even when input is empty

  const canSubmit = mode === 'register'
    ? (currentValue.length > 0 && secure && !accountExists)
    : mode === 'login'
    ? (currentValue.length > 0 && !!accountExists)
    : true; // In recover mode, allow submitting even with empty input (will prompt to select a passkey)

  return { canShowContinue, canSubmit };
}

export default useProceedEligibility;
