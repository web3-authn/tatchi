import {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  PasskeyManager,
  DeviceLinkingPhase,
  type SignNEP413MessageParams,
  type SignNEP413MessageResult,
  ActionArgs
} from '@/index';
import type { WalletIframeRouter } from '@/core/WalletIframe/client/router';
import { useNearClient } from '../hooks/useNearClient';
import { useAccountInput } from '../hooks/useAccountInput';
import type {
  PasskeyContextType,
  PasskeyContextProviderProps,
  LoginState,
  AccountInputState,
  RegistrationResult,
  LoginHooksOptions,
  LoginResult,
  RegistrationHooksOptions,
  BaseHooksOptions,
  ActionHooksOptions,
  StartDeviceLinkingOptionsDevice2,
  ScanAndLinkDeviceOptionsDevice1,
  DeviceLinkingSSEEvent,
} from '../types';
import { AccountRecoveryHooksOptions } from '@/core/types/passkeyManager';
import { PasskeyManagerConfigs } from '@/core/types/passkeyManager';
import { buildConfigsFromEnv } from '@/core/configPresets';
import { toAccountId } from '@/core/types/accountIds';

const PasskeyContext = createContext<PasskeyContextType | undefined>(undefined);

// Global singleton to prevent multiple manager instances in StrictMode
let globalPasskeyManager: PasskeyManager | null = null;
let globalConfig: PasskeyManagerConfigs | null = null;

// Note: defaults moved to core/defaultConfigs to avoid coupling top-level SDK
// consumers to React bundles.

export const PasskeyProvider: React.FC<PasskeyContextProviderProps> = ({
  children,
  config,
}) => {

  // Authentication state (actual login status)
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

  // Initialize manager (PasskeyManager or PasskeyManagerIframe) with singleton pattern
  const passkeyManager = useMemo<PasskeyManager>(() => {
    // Resolve full configs from env + optional overrides. This also validates relayer etc.
    const finalConfig: PasskeyManagerConfigs = buildConfigsFromEnv(config || {});
    const configChanged = JSON.stringify(globalConfig) !== JSON.stringify(finalConfig);
    if (!globalPasskeyManager || configChanged) {
      console.debug('PasskeyProvider: Creating manager with config:', finalConfig);
      globalPasskeyManager = new PasskeyManager(finalConfig, nearClient);
      globalConfig = finalConfig;
    }
    return globalPasskeyManager as PasskeyManager;
  }, [config, nearClient]);

  const pmIframeRef = useRef<WalletIframeRouter | null>(null);

  // Initialize wallet service via PasskeyManagerIframe when walletOrigin is provided
  useEffect(() => {
    let offReady: (() => void) | undefined;
    let offVrf: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const useIframe = !!passkeyManager.configs.iframeWallet?.walletOrigin;
        if (!useIframe) {
          setWalletIframeConnected(false);
          return;
        }

        await passkeyManager.initWalletIframe();
        const client = passkeyManager.getServiceClient();
        if (!client) { setWalletIframeConnected(false); return; }
        if (cancelled) return;
        setWalletIframeConnected(client.isReady());

        offReady = client.onReady?.(() => setWalletIframeConnected(true));

        offVrf = client.onVrfStatusChanged?.(async (status) => {
          if (cancelled) return;
          if (status?.active && status?.nearAccountId) {
            const state = await client.getLoginState(status.nearAccountId);
            // Ensure local preferences are scoped to this user
            try { passkeyManager.userPreferences.setCurrentUser(toAccountId(status.nearAccountId)); } catch {}
            setLoginState(prev => ({
              ...prev,
              isLoggedIn: true,
              nearAccountId: status.nearAccountId,
              nearPublicKey: state.publicKey || null,
            }));
          } else if (status && status.active === false) {
            setLoginState(prev => ({ ...prev, isLoggedIn: false }));
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
        console.warn('[PasskeyProvider] WalletIframe init failed:', err);
      }
    })();
    return () => {
      cancelled = true;
      offReady && offReady();
      offVrf && offVrf();
      pmIframeRef.current = null;
    };
  }, [passkeyManager]);

  // Use account input hook
  const accountInputHook = useAccountInput({
    passkeyManager,
    relayerAccount: passkeyManager.configs.relayer.accountId,
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
      await passkeyManager.logoutAndClearVrfSession();
    } catch (error) {
      console.warn('VRF logout warning:', error);
    }

    setLoginState(prevState => ({
      ...prevState,
      isLoggedIn: false,
      nearAccountId: null,
      nearPublicKey: null,
    }));
  }, [passkeyManager]);

  const loginPasskey = async (nearAccountId: string, options?: LoginHooksOptions) => {
    const result: LoginResult = await passkeyManager.loginPasskey(nearAccountId, {
      ...options,
      onEvent: async (event) => {
        if (event.phase === 'login-complete' && event.status === 'success') {
          const currentLoginState = await passkeyManager.getLoginState(nearAccountId);
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

  const registerPasskey = async (nearAccountId: string, options?: RegistrationHooksOptions) => {
    const result: RegistrationResult = await passkeyManager.registerPasskey(nearAccountId, {
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

  const recoverAccount = async (args: { accountId?: string; options?: AccountRecoveryHooksOptions }) => {
    return await passkeyManager.recoverAccountFlow({ accountId: args.accountId, options: args.options });
  }

  // Device2: Start device linking flow (returns QR payload)
  const startDevice2LinkingFlow = async (options?: StartDeviceLinkingOptionsDevice2) => {
    const res = await passkeyManager.startDevice2LinkingFlow({
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
    await passkeyManager.stopDevice2LinkingFlow();
  };

  const executeAction = async (args: {
    nearAccountId: string,
    receiverId: string,
    actionArgs: ActionArgs,
    options?: ActionHooksOptions
  }) => {
    return await passkeyManager.executeAction({
      nearAccountId: args.nearAccountId,
      receiverId: args.receiverId,
      actionArgs: args.actionArgs,
      options: args.options
    });
  }

  const signNEP413Message = async (args: {
    nearAccountId: string,
    params: SignNEP413MessageParams,
    options?: BaseHooksOptions
  }) => {
    return await passkeyManager.signNEP413Message({
      nearAccountId: args.nearAccountId,
      params: args.params,
      options: args.options
    });
  }

  // Function to manually refresh login state
  const refreshLoginState = useCallback(async (nearAccountId?: string) => {
    try {
      // Prefer wallet-origin VRF status if available via PasskeyManagerIframe
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
      const ls = await passkeyManager.getLoginState(nearAccountId);
      if (ls.nearAccountId) {
        try { passkeyManager.userPreferences.setCurrentUser(toAccountId(ls.nearAccountId)); } catch {}
        setLoginState(prevState => ({
          ...prevState,
          nearAccountId: ls.nearAccountId,
          nearPublicKey: ls.publicKey,
          isLoggedIn: ls.vrfActive
        }));
      }
    } catch (error) {
      console.error('Error refreshing login state:', error);
    }
  }, [passkeyManager]);

  // Load user data on mount
  useEffect(() => {
    refreshLoginState();
  }, [refreshLoginState]);

  // No direct window bridging needed: router emits onVrfStatusChanged after overlay registration

  const value: PasskeyContextType = {
    // Core PasskeyManager instance - provides ALL functionality
    passkeyManager,

    // Simple login/register functions
    registerPasskey,
    loginPasskey,
    logout,                      // Clears VRF session (logs out)

    // Execute actions
    executeAction,
    // NEP-413 message signing
    signNEP413Message,           // Sign NEP-413 messages

    // Account recovery functions
    recoverAccount,             // Single-endpoint account recovery flow (wallet-origin when available)
    // Device linking functions
    startDevice2LinkingFlow,     // Start device linking (returns QR payload)
    stopDevice2LinkingFlow,      // Stop device linking flow

    // Login state
    getLoginState: (nearAccountId?: string) => passkeyManager.getLoginState(nearAccountId),
    refreshLoginState,           // Manually refresh login state
    loginState,
    walletIframeConnected,

    // Account input management
    // UI account name input state (form/input tracking)
    accountInputState,
    setInputUsername: accountInputHook.setInputUsername,
    refreshAccountData: accountInputHook.refreshAccountData,

    // Confirmation configuration functions
    setConfirmBehavior: (behavior: 'requireClick' | 'autoProceed') => passkeyManager.setConfirmBehavior(behavior),
    setConfirmationConfig: (config) => passkeyManager.setConfirmationConfig(config),
    setUserTheme: (theme: 'dark' | 'light') => passkeyManager.setUserTheme(theme),
    getConfirmationConfig: () => passkeyManager.getConfirmationConfig(),

    // Account management functions
    viewAccessKeyList: (accountId: string) => passkeyManager.viewAccessKeyList(accountId),
  };

  return <PasskeyContext.Provider value={value}>{children}</PasskeyContext.Provider>;
};

export const usePasskeyContext = () => {
  const context = useContext(PasskeyContext);
  if (context === undefined) {
    throw new Error('usePasskeyContext must be used within a PasskeyContextProvider');
  }
  return context;
};

// Re-export types for convenience
export type {
  PasskeyContextType,
  ExecuteActionCallbacks,
  RegistrationResult,
  LoginResult,
} from '../types';
