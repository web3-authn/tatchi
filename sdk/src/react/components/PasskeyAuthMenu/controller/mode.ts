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
    [AuthMenuMode.Sync]: { title: 'Sync Account', subtitle: 'Sync a wallet to this device with Passkey' },
  } as const;

  if (headings) {
    if (mode === AuthMenuMode.Login && headings.login) return headings.login;
    if (mode === AuthMenuMode.Register && headings.registration) return headings.registration;
    if (mode === AuthMenuMode.Sync && headings.syncAccount) return headings.syncAccount;
  }

  return defaults[mode] ?? defaults[AuthMenuMode.Login];
}

export interface UseAuthMenuModeArgs {
  defaultMode?: AuthMenuMode;
  accountExists: boolean;
  currentValue: string;
  setCurrentValue: (v: string) => void;
  headings?: AuthMenuHeadings | null;
  /**
   * When true, forces the initial client render to start in Register mode, even if
   * `accountExists` suggests Login. This is used to align hydration with the shell skeleton.
   */
  forceInitialRegister?: boolean;
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
  forceInitialRegister = false,
}: UseAuthMenuModeArgs): UseAuthMenuModeResult {
  const preferredDefaultMode = resolveDefaultMode(accountExists, defaultMode);
  const [mode, setMode] = React.useState<AuthMenuMode>(() => {
    if (typeof defaultMode === 'number') return defaultMode;
    if (forceInitialRegister) return AuthMenuMode.Register;
    return preferredDefaultMode;
  });
  const title = React.useMemo(() => getModeTitle(mode, headings), [mode, headings]);

  const onSegmentChange = (nextMode: AuthMenuMode) => {
    setMode(nextMode);
  };

  const onInputChange = (val: string) => {
    setCurrentValue(val);
  };

  const resetToDefault = () => {
    const nextMode = resolveDefaultMode(accountExists, defaultMode);
    setMode(nextMode);
    setCurrentValue('');
  };

  return { mode, setMode, title, onSegmentChange, onInputChange, resetToDefault };
}

export default useAuthMenuMode;
