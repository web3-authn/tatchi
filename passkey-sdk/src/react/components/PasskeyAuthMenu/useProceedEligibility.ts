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
  const canShowContinue = mode === AuthMenuMode.Register
    ? (currentValue.length > 0 && !accountExists)
    : mode === AuthMenuMode.Login
    ? (currentValue.length > 0 && !!accountExists)
    : true; // In recover mode, show Continue even when input is empty

  const canSubmit = mode === AuthMenuMode.Register
    ? (currentValue.length > 0 && secure && !accountExists)
    : mode === AuthMenuMode.Login
    ? (currentValue.length > 0 && !!accountExists)
    : true; // In recover mode, allow submitting even with empty input (will prompt to select a passkey)

  return { canShowContinue, canSubmit };
}

export default useProceedEligibility;
