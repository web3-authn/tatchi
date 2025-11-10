import React from 'react';
import { awaitWalletIframeReady } from '../../utils/walletIframe';
import { AuthMenuMode, type AuthMenuTitle, type AuthMenuHeadings } from './types';

export function resolveDefaultMode(
  accountExists: boolean,
  requested?: AuthMenuMode | null
): AuthMenuMode {
  if (typeof requested === 'number') {
    return requested;
  }
  return accountExists ? AuthMenuMode.Login : AuthMenuMode.Register;
}

export function getModeTitle(mode: AuthMenuMode, headings?: AuthMenuHeadings | null): AuthMenuTitle {
  const defaults: Record<AuthMenuMode, AuthMenuTitle> = {
    [AuthMenuMode.Login]: {
      title: 'Login',
      subtitle: 'Login with Passkey',
    },
    [AuthMenuMode.Register]: {
      title: 'Register Account',
      subtitle: 'Create a wallet with Passkey',
    },
    [AuthMenuMode.Recover]: {
      title: 'Recover Account',
      subtitle: 'Restore a wallet with Passkey',
    },
  } as const;

  if (headings) {
    if (mode === AuthMenuMode.Login && headings.login) return headings.login;
    if (mode === AuthMenuMode.Register && headings.registration) return headings.registration;
    if (mode === AuthMenuMode.Recover && headings.recoverAccount) return headings.recoverAccount;
  }
  switch (mode) {
    case AuthMenuMode.Login:
      return defaults[AuthMenuMode.Login];
    case AuthMenuMode.Register:
      return defaults[AuthMenuMode.Register];
    case AuthMenuMode.Recover:
      return defaults[AuthMenuMode.Recover];
    default:
      return defaults[AuthMenuMode.Login];
  }
}

export interface UseAuthMenuModeArgs {
  defaultMode?: AuthMenuMode;
  accountExists: boolean;
  passkeyManager?: {
    getRecentLogins: () => Promise<{
      lastUsedAccountId?: { nearAccountId?: string } | null;
    }>;
  } | null;
  currentValue: string;
  setCurrentValue: (v: string) => void;
  headings?: AuthMenuHeadings | null;
}

export interface UseAuthMenuModeResult {
  mode: AuthMenuMode;
  setMode: React.Dispatch<React.SetStateAction<AuthMenuMode>>;
  title: { title: string; subtitle: string };
  onSegmentChange: (next: AuthMenuMode) => void;
  onInputChange: (val: string) => void;
  resetToDefault: () => void;
}

export function useAuthMenuMode({
  defaultMode,
  accountExists,
  passkeyManager,
  currentValue,
  setCurrentValue,
  headings,
}: UseAuthMenuModeArgs): UseAuthMenuModeResult {
  const preferredDefaultMode: AuthMenuMode = resolveDefaultMode(accountExists, defaultMode);
  const [mode, setMode] = React.useState<AuthMenuMode>(preferredDefaultMode);
  const [title, setTitle] = React.useState<AuthMenuTitle>(getModeTitle(preferredDefaultMode, headings));

  // Track if current input was auto-prefilled from IndexedDB and what value
  const prefilledFromIdbRef = React.useRef(false);
  const prefilledValueRef = React.useRef<string>('');
  // Track last mode to detect transitions into 'login'
  const prevModeRef = React.useRef<AuthMenuMode | null>(null);

  // When switching to the "login" segment, attempt to prefill last used account
  React.useEffect(() => {
    let cancelled = false;
    const enteringLogin = mode === AuthMenuMode.Login && prevModeRef.current !== AuthMenuMode.Login;
    if (enteringLogin && passkeyManager) {
      (async () => {
        try {
          // Await wallet iframe readiness when applicable
          await awaitWalletIframeReady(passkeyManager);
          const { lastUsedAccountId } = await passkeyManager.getRecentLogins();
          if (!cancelled && lastUsedAccountId) {
            const username = (lastUsedAccountId.nearAccountId || '').split('.')[0] || '';
            // Only populate if empty on entry to login segment
            if (!currentValue || currentValue.trim().length === 0) {
              setCurrentValue(username);
              prefilledFromIdbRef.current = true;
              prefilledValueRef.current = username;
            }
          }
        } catch {
          // ignore if IndexedDB is unavailable
        }
      })();
    }
    prevModeRef.current = mode;
    return () => { cancelled = true; };
  }, [mode, passkeyManager, currentValue, setCurrentValue]);

  React.useEffect(() => {
    setTitle(getModeTitle(mode, headings));
  }, [mode, headings]);

  const onSegmentChange = (nextMode: AuthMenuMode) => {
    if (mode === AuthMenuMode.Login && nextMode !== AuthMenuMode.Login) {
      // Clear only if the value was auto-prefilled and remains unchanged
      if (prefilledFromIdbRef.current && currentValue === prefilledValueRef.current) {
        setCurrentValue('');
      }
      prefilledFromIdbRef.current = false;
      prefilledValueRef.current = '';
    }
    setMode(nextMode);
    setTitle(getModeTitle(nextMode, headings));
  };

  const onInputChange = (val: string) => {
    if (val !== prefilledValueRef.current) {
      prefilledFromIdbRef.current = false;
    }
    setCurrentValue(val);
  };

  const resetToDefault = () => {
    const nextMode = resolveDefaultMode(accountExists, defaultMode);
    setMode(nextMode);
    setTitle(getModeTitle(nextMode, headings));
    // Clear any prefill markers
    prefilledFromIdbRef.current = false;
    prefilledValueRef.current = '';
  };

  return { mode, setMode, title, onSegmentChange, onInputChange, resetToDefault };
}

export default useAuthMenuMode;
