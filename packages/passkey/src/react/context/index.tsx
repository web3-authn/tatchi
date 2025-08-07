import {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  PasskeyManager,
  AccountRecoveryFlow,
  DeviceLinkingPhase,
  type SignNEP413MessageParams,
  type SignNEP413MessageResult,
  ActionArgs
} from '@/index';
import { useNearClient } from '../hooks/useNearClient';
import { useAccountInput } from '../hooks/useAccountInput';
import { useRelayer } from '../hooks/useRelayer';
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
} from '../types';
import { AccountRecoveryHooksOptions } from '@/core/types/passkeyManager';
import { PasskeyManagerConfigs } from "@/core/types/passkeyManager";

const PasskeyContext = createContext<PasskeyContextType | undefined>(undefined);

// Global singleton to prevent multiple PasskeyManager instances in StrictMode
let globalPasskeyManager: PasskeyManager | null = null;
let globalConfig: any = null;

export const PASSKEY_MANAGER_DEFAULT_CONFIGS: PasskeyManagerConfigs = {
  // nearRpcUrl: 'https://rpc.testnet.near.org',
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  nearNetwork: 'testnet' as const,
  contractId: 'web3-authn-v4.testnet',
  nearExplorerUrl: 'https://testnet.nearblocks.io',
  relayer: {
    accountId: 'web3-authn-v4.testnet',
    url: 'http://localhost:3000',
    initialUseRelayer: true,
  },
}

export const PasskeyProvider: React.FC<PasskeyContextProviderProps> = ({
  children,
  config = PASSKEY_MANAGER_DEFAULT_CONFIGS,
}) => {

  // Authentication state (actual login status)
  // Note: isLoggedIn is true ONLY when VRF worker has private key in memory (vrfActive = true)
  // This means the user can generate VRF challenges without additional TouchID prompts
  const [loginState, setLoginState] = useState<LoginState>({
    isLoggedIn: false,
    nearAccountId: null,
    nearPublicKey: null,
  });

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

  // Initialize PasskeyManager with singleton pattern to prevent double initialization in StrictMode
  const passkeyManager = useMemo(() => {

    const finalConfig = { ...PASSKEY_MANAGER_DEFAULT_CONFIGS, ...config };
    // Check if we already have a global instance with the same config
    const configChanged = JSON.stringify(globalConfig) !== JSON.stringify(finalConfig);

    if (!globalPasskeyManager || configChanged) {
      console.log('PasskeyProvider: Creating new PasskeyManager instance with config:', finalConfig);
      globalPasskeyManager = new PasskeyManager(finalConfig, nearClient);
      globalConfig = finalConfig;
    } else {
      console.debug('PasskeyProvider: Reusing existing PasskeyManager instance');
    }

    return globalPasskeyManager;
  }, [config]);

  // Use relayer hook
  const relayerHook = useRelayer({
    initialValue: config?.relayer.initialUseRelayer ?? false
  });

  // Use account input hook
  const accountInputHook = useAccountInput({
    passkeyManager,
    relayerAccount: passkeyManager.configs.relayer.accountId,
    useRelayer: relayerHook.useRelayer,
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
      console.log("SDK LOGOUT");
      // Clear VRF session when user logs out
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

  const loginPasskey = async (nearAccountId: string, options: LoginHooksOptions) => {
    const result: LoginResult = await passkeyManager.loginPasskey(nearAccountId, {
      ...options,
      onEvent: async (event) => {
        if (event.phase === 'login-complete' && event.status === 'success') {
          // Check VRF status to determine if user is truly logged in
          const currentLoginState = await passkeyManager.getLoginState(nearAccountId);
          const isVRFLoggedIn = currentLoginState.vrfActive;

          setLoginState(prevState => ({
            ...prevState,
            isLoggedIn: isVRFLoggedIn,  // Only logged in if VRF is active
            nearAccountId: event.nearAccountId || null,
            nearPublicKey: event.clientNearPublicKey || null,
          }));

          console.log('Login completed - VRF status:', {
            vrfActive: currentLoginState.vrfActive,
            isLoggedIn: isVRFLoggedIn
          });
        }
        options.onEvent?.(event);
      },
      onError: (error) => {
        logout();
        options.onError?.(error);
      }
    });

    return result
  }

  const registerPasskey = async (nearAccountId: string, options: RegistrationHooksOptions) => {
    const result: RegistrationResult = await passkeyManager.registerPasskey(nearAccountId, {
      ...options,
      onEvent: async (event) => {
        if (event.phase === 'registration-complete' && event.status === 'success') {
          // Check VRF status to determine if user is truly logged in after registration
          const currentLoginState = await passkeyManager.getLoginState(nearAccountId);
          const isVRFLoggedIn = currentLoginState.vrfActive;

          setLoginState(prevState => ({
            ...prevState,
            isLoggedIn: isVRFLoggedIn,  // Only logged in if VRF is active
            nearAccountId: nearAccountId,
            nearPublicKey: currentLoginState.publicKey || null,
          }));

          console.log('Registration completed - VRF status:', {
            vrfActive: currentLoginState.vrfActive,
            isLoggedIn: isVRFLoggedIn,
            nearAccountId: nearAccountId,
            publicKey: currentLoginState.publicKey
          });
        }
        options.onEvent?.(event);
      },
      onError: (error) => {
        logout();
        options.onError?.(error);
      }
    });

    return result;
  }

  const startAccountRecoveryFlow = (options?: AccountRecoveryHooksOptions): AccountRecoveryFlow => {
    return passkeyManager.startAccountRecoveryFlow(options);
  }

  /**
   * Device2: Start device linking flow
   * @param options - DeviceLinkingOptionsDevice2
   * @returns LinkDeviceFlow
   */
  const startDeviceLinkingFlow = (options?: StartDeviceLinkingOptionsDevice2) => {
    return passkeyManager.startDeviceLinkingFlow({
      ...options,
      onEvent: (event) => {
        // Call original event handler
        options?.onEvent?.(event);

        console.log('Device linking event received:', { phase: event.phase, status: event.status, message: event.message });

        // Update React state when auto-login completes successfully
        if (event.phase === DeviceLinkingPhase.STEP_7_LINKING_COMPLETE && event.status === 'success') {
          console.log('Device linking auto-login completed - refreshing login state...');
          // Refresh login state to update React context after successful auto-login
          refreshLoginState()
        }
      }
    });
  }

  const executeAction = async (
    nearAccountId: string,
    actionArgs: ActionArgs,
    options?: ActionHooksOptions
  ) => {
    return await passkeyManager.executeAction(nearAccountId, actionArgs, options);
  }

  const signNEP413Message = async (
    nearAccountId: string,
    params: SignNEP413MessageParams,
    options?: BaseHooksOptions
  ) => {
    return await passkeyManager.signNEP413Message(nearAccountId, params, options);
  }

  // Function to manually refresh login state
  const refreshLoginState = useCallback(async (nearAccountId?: string) => {
    try {
      const loginState = await passkeyManager.getLoginState(nearAccountId);

      if (loginState.nearAccountId) {
        // User is only logged in if VRF worker has private key in memory
        const isVRFLoggedIn = loginState.vrfActive;

        setLoginState(prevState => ({
          ...prevState,
          nearAccountId: loginState.nearAccountId,
          nearPublicKey: loginState.publicKey,
          isLoggedIn: isVRFLoggedIn  // Only logged in if VRF is active
        }));

        console.log('Refreshed login state:', {
          nearAccountId: loginState.nearAccountId,
          publicKey: loginState.publicKey,
          isLoggedIn: isVRFLoggedIn,
          vrfActive: loginState.vrfActive,
          hasUserData: !!loginState.userData
        });
      }
    } catch (error) {
      console.error('Error refreshing login state:', error);
    }
  }, [passkeyManager]);

  // Load user data on mount
  useEffect(() => {
    refreshLoginState();
  }, [refreshLoginState]);

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
    startAccountRecoveryFlow,   // Create account recovery flow to discover accounts onchain, and recover accounts
    // Device linking functions
    startDeviceLinkingFlow,     // Create device linking flow for Whatsapp-style QR scan + device linking

    // Login state
    getLoginState: (nearAccountId?: string) => passkeyManager.getLoginState(nearAccountId),
    refreshLoginState,           // Manually refresh login state
    loginState,

    // Account input management
    // UI account name input state (form/input tracking)
    accountInputState,
    setInputUsername: accountInputHook.setInputUsername,
    refreshAccountData: accountInputHook.refreshAccountData,
    useRelayer: relayerHook.useRelayer,
    setUseRelayer: relayerHook.setUseRelayer,
    toggleRelayer: relayerHook.toggleRelayer,
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