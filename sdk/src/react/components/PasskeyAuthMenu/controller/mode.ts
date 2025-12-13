import React from 'react';
import type { AuthMenuHeadings } from '../types';
import { AuthMenuMode } from '../types';

export interface AuthMenuTitle {
  title: string;
  subtitle: string;
}

export function resolveDefaultMode(
  accountExists: boolean,
  requested?: AuthMenuMode | null,
): AuthMenuMode {
  if (typeof requested === 'number') return requested;
  return accountExists ? AuthMenuMode.Login : AuthMenuMode.Register;
}

export function getModeTitle(mode: AuthMenuMode, headings?: AuthMenuHeadings | null): AuthMenuTitle {
  const defaults: Record<AuthMenuMode, AuthMenuTitle> = {
    [AuthMenuMode.Login]: { title: 'Login', subtitle: 'Login with Passkey' },
    [AuthMenuMode.Register]: { title: 'Register Account', subtitle: 'Create a wallet with Passkey' },
    [AuthMenuMode.Recover]: { title: 'Recover Account', subtitle: 'Restore a wallet with Passkey' },
  } as const;

  if (headings) {
    if (mode === AuthMenuMode.Login && headings.login) return headings.login;
    if (mode === AuthMenuMode.Register && headings.registration) return headings.registration;
    if (mode === AuthMenuMode.Recover && headings.recoverAccount) return headings.recoverAccount;
  }

  return defaults[mode] ?? defaults[AuthMenuMode.Login];
}

export interface UseAuthMenuModeArgs {
  defaultMode?: AuthMenuMode;
  accountExists: boolean;
  currentValue: string;
  setCurrentValue: (v: string) => void;
  headings?: AuthMenuHeadings | null;
}

export interface UseAuthMenuModeResult {
  mode: AuthMenuMode;
  setMode: React.Dispatch<React.SetStateAction<AuthMenuMode>>;
  title: AuthMenuTitle;
  onSegmentChange: (next: AuthMenuMode) => void;
  onInputChange: (val: string) => void;
  resetToDefault: () => void;
}

/**
 * `useAuthMenuMode`
 *
 * Minimal mode/title controller for PasskeyAuthMenu.
 * - No IndexedDB/wallet-prefill logic yet (intentionally).
 * - Pure state transitions to keep the baseline bundle small and predictable.
 */
export function useAuthMenuMode({
  defaultMode,
  accountExists,
  currentValue,
  setCurrentValue,
  headings,
}: UseAuthMenuModeArgs): UseAuthMenuModeResult {
  const preferredDefaultMode = resolveDefaultMode(accountExists, defaultMode);
  const [mode, setMode] = React.useState<AuthMenuMode>(preferredDefaultMode);
  const [title, setTitle] = React.useState<AuthMenuTitle>(
    getModeTitle(preferredDefaultMode, headings),
  );

  React.useEffect(() => {
    setTitle(getModeTitle(mode, headings));
  }, [mode, headings]);

  const onSegmentChange = (nextMode: AuthMenuMode) => {
    setMode(nextMode);
    setTitle(getModeTitle(nextMode, headings));
  };

  const onInputChange = (val: string) => {
    setCurrentValue(val);
  };

  const resetToDefault = () => {
    const nextMode = resolveDefaultMode(accountExists, defaultMode);
    setMode(nextMode);
    setTitle(getModeTitle(nextMode, headings));
    setCurrentValue('');
  };

  return { mode, setMode, title, onSegmentChange, onInputChange, resetToDefault };
}

export default useAuthMenuMode;
