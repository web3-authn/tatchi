import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { WalletIframeRouter } from '@/core/WalletIframe/client/router';
import { useNearClient } from '../hooks/useNearClient';
import { useAccountInput } from '../hooks/useAccountInput';
import { useEagerPrewarm } from './useEagerPrewarm';
import { useLoginStateRefresher } from './useLoginStateRefresher';
import { useTatchiContextValue } from './useTatchiContextValue';
import { useWalletIframeLifecycle } from './useWalletIframeLifecycle';
import { getOrCreateTatchiManager } from './tatchiManagerSingleton';
import type {
  TatchiContextType,
  TatchiContextProviderProps,
  LoginState,
  AccountInputState,
} from '../types';

const TatchiContext = createContext<TatchiContextType | undefined>(undefined);

export const TatchiContextProvider: React.FC<TatchiContextProviderProps> = ({
  children,
  config,
  theme,
  eager,
}) => {
  const [loginState, setLoginState] = useState<LoginState>({
    isLoggedIn: false,
    nearAccountId: null,
    nearPublicKey: null,
  });
  const [walletIframeConnected, setWalletIframeConnected] = useState<boolean>(false);

  const nearClient = useNearClient();
  const tatchi = useMemo(() => getOrCreateTatchiManager(config, nearClient), [config, nearClient]);

  const walletIframeClientRef = useRef<WalletIframeRouter | null>(null);

  useEagerPrewarm(tatchi, eager);

  useWalletIframeLifecycle({
    tatchi,
    walletIframeClientRef,
    setWalletIframeConnected,
    setLoginState,
  });

  const accountInputHook = useAccountInput({
    tatchi,
    contractId: tatchi.configs.contractId,
    currentNearAccountId: loginState.nearAccountId,
    isLoggedIn: loginState.isLoggedIn,
  });

  const {
    inputUsername,
    lastLoggedInUsername,
    lastLoggedInDomain,
    targetAccountId,
    displayPostfix,
    isUsingExistingAccount,
    accountExists,
    indexDBAccounts,
    setInputUsername,
    refreshAccountData,
  } = accountInputHook;

  const accountInputState: AccountInputState = useMemo(() => ({
    inputUsername,
    lastLoggedInUsername,
    lastLoggedInDomain,
    targetAccountId,
    displayPostfix,
    isUsingExistingAccount,
    accountExists,
    indexDBAccounts,
  }), [
    inputUsername,
    lastLoggedInUsername,
    lastLoggedInDomain,
    targetAccountId,
    displayPostfix,
    isUsingExistingAccount,
    accountExists,
    indexDBAccounts,
  ]);

  const refreshLoginState = useLoginStateRefresher({
    tatchi,
    walletIframeConnected,
    walletIframeClientRef,
    setLoginState,
  });

  useEffect(() => {
    if (!theme?.theme) return;
    tatchi.setTheme(theme.theme);
  }, [tatchi, theme?.theme]);

  const value = useTatchiContextValue({
    tatchi,
    loginState,
    setLoginState,
    walletIframeConnected,
    refreshLoginState,
    accountInputState,
    setInputUsername,
    refreshAccountData,
    hostSetTheme: theme?.setTheme,
  });

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
