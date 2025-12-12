import {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { TatchiPasskey } from '@/core/TatchiPasskey';
import { DeviceLinkingPhase } from '@/core/types/passkeyManager';
import type { SignNEP413MessageParams, SignNEP413MessageResult } from '@/core/TatchiPasskey/signNEP413';
import type { ActionArgs } from '@/core/types/actions';
import type { WalletIframeRouter } from '@/core/WalletIframe/client/router';
import { useNearClient } from '../hooks/useNearClient';
import { useAccountInput } from '../hooks/useAccountInput';
import type {
  TatchiContextType,
  TatchiContextProviderProps,
  LoginState,
  AccountInputState,
  RegistrationResult,
  LoginHooksOptions,
  LoginResult,
  RegistrationHooksOptions,
  ActionHooksOptions,
  SignNEP413HooksOptions,
  StartDeviceLinkingOptionsDevice2,
  ScanAndLinkDeviceOptionsDevice1,
  DeviceLinkingSSEEvent,
} from '../types';
import { AccountRecoveryHooksOptions, TatchiPasskeyConfigs, DelegateActionHooksOptions } from '@/core/types/passkeyManager';
import { buildConfigsFromEnv } from '@/core/defaultConfigs';
import { toAccountId } from '@/core/types/accountIds';
import { DelegateActionInput } from '@/core/types/delegate';

// Global singleton to prevent multiple manager instances in StrictMode
let globalPasskeyManager: TatchiPasskey | null = null;
let globalConfig: TatchiPasskeyConfigs | null = null;

const TatchiContext = createContext<TatchiContextType | undefined>(undefined);

export const TatchiContextProvider: React.FC<TatchiContextProviderProps> = ({
  children,
  config,
  eager,
}) => {

  // Authentication state
  // Note: isLoggedIn is true ONLY when VRF worker has private key in memory (vrfActive = true)
  // This means the user can generate VRF challenges without additional TouchID prompts
  const [loginState, setLoginState] = useState<LoginState>({
    isLoggedIn: false,
    nearAccountId: null,
    nearPublicKey: null,
  });
  // Wallet iframe connection status
  const [walletIframeConnected, setWalletIframeConnected] = useState<boolean>(false);

  // UI input state (separate from authentication state)
  const [accountInputState, setAccountInputState] = useState<AccountInputState>({
    inputUsername: '',
    lastLoggedInUsername: '',
    lastLoggedInDomain: '',
    targetAccountId: '',
    displayPostfix: '',
    isUsingExistingAccount: false,
    accountExists: false,
    indexDBAccounts: []
  });

  // Get the minimal NEAR RPC provider
  const nearClient = useNearClient();

  // Initialize manager (TatchiPasskey or TatchiPasskeyIframe) with singleton pattern
  const tatchi = useMemo<TatchiPasskey>(() => {
    // Resolve full configs from env + optional overrides. This also validates relayer etc.
    const finalConfig: TatchiPasskeyConfigs = buildConfigsFromEnv(config);
    const configChanged = JSON.stringify(globalConfig) !== JSON.stringify(finalConfig);
    if (!globalPasskeyManager || configChanged) {
      console.debug('TatchiContextProvider: Creating manager with config:', finalConfig);
      globalPasskeyManager = new TatchiPasskey(finalConfig, nearClient);
      globalConfig = finalConfig;
    }
    return globalPasskeyManager as TatchiPasskey;
  }, [config, nearClient]);

  const pmIframeRef = useRef<WalletIframeRouter | null>(null);

  // Optional eager prewarm: warm iframe + workers on idle after mount.
  useEffect(() => {
    if (!eager) return;
    if (typeof window === 'undefined') return;

    let cancelled = false;
    const win: any = window;

    const run = async () => {
      if (cancelled) return;
      try {
        const anyTatchi: any = tatchi as any;
        if (typeof anyTatchi.prewarm === 'function') {
          await anyTatchi.prewarm({ iframe: true, workers: true }).catch(() => undefined);
        } else {
          // Fallback for older builds: use initWalletIframe which also warms local resources
          await tatchi.initWalletIframe().catch(() => undefined);
        }
      } catch {
        // best-effort
      }
    };

    let idleId: number | undefined;
    let timeoutId: number | undefined;

    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(() => { void run(); }, { timeout: 1500 }) as number;
    } else {
      timeoutId = window.setTimeout(() => { void run(); }, 600);
    }

    return () => {
      cancelled = true;
      if (idleId != null && typeof win.cancelIdleCallback === 'function') {
        try { win.cancelIdleCallback(idleId); } catch {}
      }
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    };
  }, [eager, tatchi]);

  // Initialize wallet service via TatchiPasskeyIframe when walletOrigin is provided
  useEffect(() => {
    let offReady: (() => void) | undefined;
    let offVrf: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const useIframe = !!tatchi.configs.iframeWallet?.walletOrigin;
        if (!useIframe) {
          setWalletIframeConnected(false);
          return;
        }

        await tatchi.initWalletIframe();
        const client = tatchi.getWalletIframeClient?.();
        if (!client) { setWalletIframeConnected(false); return; }
        if (cancelled) return;
        setWalletIframeConnected(client.isReady());

        offReady = client.onReady?.(() => setWalletIframeConnected(true));

        offVrf = client.onVrfStatusChanged?.(async (status: { active: boolean; nearAccountId: string | null; sessionDuration?: number }) => {
          if (cancelled) return;
          if (status?.active && status?.nearAccountId) {
            const state = await client.getLoginState(status.nearAccountId);
            // Ensure local preferences are scoped to this user
            try { tatchi.userPreferences.setCurrentUser(toAccountId(status.nearAccountId)); } catch {}
            setLoginState(prev => ({
              ...prev,
              isLoggedIn: true,
              nearAccountId: status.nearAccountId,
              nearPublicKey: state.publicKey || null,
            }));
          } else if (status && status.active === false) {
            // Hard reset state on wallet-origin VRF deactivation
            setLoginState(prev => ({
              ...prev,
              isLoggedIn: false,
              nearAccountId: null,
              nearPublicKey: null,
            }));
          }
        });

        // Reflect initial status
        try {
          const st = await client.getLoginState();
          if (st?.vrfActive && st?.nearAccountId) {
            setLoginState(prev => ({
              ...prev,
              isLoggedIn: true,
              nearAccountId: st.nearAccountId,
              nearPublicKey: st.publicKey || null,
            }));
          }
        } catch {}
        pmIframeRef.current = client;
      } catch (err) {
        console.warn('[TatchiContextProvider] WalletIframe init failed:', err);
      }
    })();
    return () => {
      cancelled = true;
      offReady && offReady();
      offVrf && offVrf();
      pmIframeRef.current = null;
    };
  }, [tatchi]);

  // Use account input hook
  const accountInputHook = useAccountInput({
    tatchi,
    contractId: tatchi.configs.contractId,
    currentNearAccountId: loginState.nearAccountId,
    isLoggedIn: loginState.isLoggedIn
  });

  // Sync account input hook state with account input state
  useEffect(() => {
    setAccountInputState({
      inputUsername: accountInputHook.inputUsername,
      lastLoggedInUsername: accountInputHook.lastLoggedInUsername,
      lastLoggedInDomain: accountInputHook.lastLoggedInDomain,
      targetAccountId: accountInputHook.targetAccountId,
      displayPostfix: accountInputHook.displayPostfix,
      isUsingExistingAccount: accountInputHook.isUsingExistingAccount,
      accountExists: accountInputHook.accountExists,
      indexDBAccounts: accountInputHook.indexDBAccounts
    });
  }, [
    accountInputHook.inputUsername,
    accountInputHook.lastLoggedInUsername,
    accountInputHook.lastLoggedInDomain,
    accountInputHook.targetAccountId,
    accountInputHook.displayPostfix,
    accountInputHook.isUsingExistingAccount,
    accountInputHook.accountExists,
    accountInputHook.indexDBAccounts
  ]);

  // Simple logout that only manages React state
  const logout = useCallback(async () => {
    try {
      // Clear VRF session when user logs out (also clears wallet-origin session if active)
      await tatchi.logoutAndClearVrfSession();
    } catch (error) {
      console.warn('VRF logout warning:', error);
    }

    setLoginState(prevState => ({
      ...prevState,
      isLoggedIn: false,
      nearAccountId: null,
      nearPublicKey: null,
    }));
  }, [tatchi]);

  const loginPasskey = async (nearAccountId: string, options?: LoginHooksOptions) => {
    const result: LoginResult = await tatchi.loginPasskey(nearAccountId, {
      ...options,
      onEvent: async (event) => {
        if (event.phase === 'login-complete' && event.status === 'success') {
          const currentLoginState = await tatchi.getLoginState(nearAccountId);
          const isVRFLoggedIn = currentLoginState.vrfActive;
          setLoginState(prevState => ({
            ...prevState,
            isLoggedIn: isVRFLoggedIn,
            nearAccountId: event.nearAccountId || null,
            nearPublicKey: event.clientNearPublicKey || null,
          }));
        }
        options?.onEvent?.(event);
      },
      onError: (error) => {
        logout();
        options?.onError?.(error);
      }
    });

    return result
  }

  const registerPasskey = async (
    nearAccountId: string,
    options?: RegistrationHooksOptions
  ) => {
    const result: RegistrationResult = await tatchi.registerPasskey(nearAccountId, {
      ...options,
      onEvent: async (event) => {
        // Let caller observe progress; we reflect final state after the call returns
        options?.onEvent?.(event);
      },
      onError: (error) => {
        logout();
        options?.onError?.(error);
      }
    });

    // Ensure React state reflects final VRF status after registration
    if (result?.success) {
      await refreshLoginState(nearAccountId);
    }
    return result;
  }

  const recoverAccount = async (args: {
    accountId?: string;
    options?: AccountRecoveryHooksOptions
  }) => {
    return await tatchi.recoverAccountFlow(args);
  }

  // Device2: Start device linking flow (returns QR payload)
  const startDevice2LinkingFlow = async (options?: StartDeviceLinkingOptionsDevice2) => {
    const res = await tatchi.startDevice2LinkingFlow({
      ...options,
      onEvent: (event: DeviceLinkingSSEEvent) => {
        options?.onEvent?.(event);
        if (event.phase === DeviceLinkingPhase.STEP_7_LINKING_COMPLETE && event.status === 'success') {
          refreshLoginState();
        }
      }
    });
    return res;
  };

  const stopDevice2LinkingFlow = async () => {
    await tatchi.stopDevice2LinkingFlow();
  };

  const executeAction = async (args: {
    nearAccountId: string,
    receiverId: string,
    actionArgs: ActionArgs,
    options?: ActionHooksOptions
  }) => {
    return await tatchi.executeAction(args);
  }

  const signNEP413Message = async (args: {
    nearAccountId: string,
    params: SignNEP413MessageParams,
    options?: SignNEP413HooksOptions,
  }) => {
    return await tatchi.signNEP413Message(args);
  }

  const signDelegateAction = async (args: {
    nearAccountId: string;
    delegate: DelegateActionInput;
    options?: DelegateActionHooksOptions;
  }) => {
    return await tatchi.signDelegateAction(args);
  };

  // Function to manually refresh login state
  const refreshLoginState = useCallback(async (nearAccountId?: string) => {
    try {
      // Prefer wallet-origin VRF status if available via TatchiPasskeyIframe
      const pmClient = pmIframeRef.current;
      if (walletIframeConnected && pmClient) {
        try {
          const st = await pmClient.getLoginState();
          if (st?.vrfActive && st?.nearAccountId) {
            setLoginState(prevState => ({
              ...prevState,
              nearAccountId: st.nearAccountId,
              nearPublicKey: st.publicKey,
              isLoggedIn: true,
            }));
            return;
          }
        } catch {}
      }

      // Fallback: reflect local VRF status
      const ls = await tatchi.getLoginState(nearAccountId);
      // Only retain account id when VRF session is active; otherwise clear it to avoid
      // stale "logged in" indicators in host UI that rely solely on account id.
      if (ls.nearAccountId && ls.vrfActive) {
        try { tatchi.userPreferences.setCurrentUser(toAccountId(ls.nearAccountId)); } catch {}
        setLoginState(prevState => ({
          ...prevState,
          nearAccountId: ls.nearAccountId,
          nearPublicKey: ls.publicKey,
          isLoggedIn: true,
        }));
      } else {
        setLoginState(prevState => ({
          ...prevState,
          nearAccountId: null,
          nearPublicKey: null,
          isLoggedIn: false,
        }));
      }
    } catch (error) {
      console.error('Error refreshing login state:', error);
    }
  }, [tatchi]);

  // Load user data on mount
  useEffect(() => {
    refreshLoginState();
  }, [refreshLoginState]);

  // No direct window bridging needed: router emits onVrfStatusChanged after overlay registration

  const value: TatchiContextType = {
    // Core TatchiPasskey instance - provides ALL functionality
    tatchi,

    // Simple login/register functions
    registerPasskey,
    loginPasskey,
    logout,                      // Clears VRF session (logs out)

    // Execute actions
    executeAction,
    // NEP-413 message signing
    signNEP413Message,           // Sign NEP-413 messages
    // Delegate action signing (NEP-461)
    signDelegateAction,

    // Account recovery functions
    recoverAccount,             // Single-endpoint account recovery flow (wallet-origin when available)
    // Device linking functions
    startDevice2LinkingFlow,     // Start device linking (returns QR payload)
    stopDevice2LinkingFlow,      // Stop device linking flow

    // Login state
    getLoginState: (nearAccountId?: string) => tatchi.getLoginState(nearAccountId),
    refreshLoginState,           // Manually refresh login state
    loginState,
    walletIframeConnected,

    // Account input management
    // UI account name input state (form/input tracking)
    accountInputState,
    setInputUsername: accountInputHook.setInputUsername,
    refreshAccountData: accountInputHook.refreshAccountData,

    // Confirmation configuration functions
    setConfirmBehavior: (behavior: 'requireClick' | 'autoProceed') => tatchi.setConfirmBehavior(behavior),
    setConfirmationConfig: (config) => tatchi.setConfirmationConfig(config),
    setUserTheme: (theme: 'dark' | 'light') => tatchi.setUserTheme(theme),
    getConfirmationConfig: () => tatchi.getConfirmationConfig(),

    // Account management functions
    viewAccessKeyList: (accountId: string) => tatchi.viewAccessKeyList(accountId),
  };

  return <TatchiContext.Provider value={value}>{children}</TatchiContext.Provider>;
};

export const useTatchi = () => {
  const context = useContext(TatchiContext);
  if (context === undefined) {
    throw new Error('useTatchi must be used within a TatchiContextProvider');
  }
  return context;
};

// Re-export types for convenience
export type {
  TatchiContextType,
  RegistrationResult,
  LoginResult,
} from '../types';
