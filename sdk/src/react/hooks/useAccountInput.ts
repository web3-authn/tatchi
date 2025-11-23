import { useState, useEffect, useCallback } from 'react';
import type { TatchiPasskey } from '@/core/TatchiPasskey';
import { toAccountId } from '@/core/types/accountIds';
import { awaitWalletIframeReady } from '../utils/walletIframe';

export interface AccountInputState {
  inputUsername: string;
  lastLoggedInUsername: string;
  lastLoggedInDomain: string;
  targetAccountId: string;
  displayPostfix: string;
  isUsingExistingAccount: boolean;
  accountExists: boolean;
  indexDBAccounts: string[];
}

export interface UseAccountInputOptions {
  tatchi: TatchiPasskey;
  contractId: string;
  currentNearAccountId?: string | null;
  isLoggedIn: boolean;
}

export interface UseAccountInputReturn extends AccountInputState {
  setInputUsername: (username: string) => void;
  refreshAccountData: () => Promise<void>;
}

export function useAccountInput({
  tatchi,
  contractId,
  currentNearAccountId,
  isLoggedIn
}: UseAccountInputOptions): UseAccountInputReturn {
  const [state, setState] = useState<AccountInputState>({
    inputUsername: '',
    lastLoggedInUsername: '',
    lastLoggedInDomain: '',
    targetAccountId: '',
    displayPostfix: '',
    isUsingExistingAccount: false,
    accountExists: false,
    indexDBAccounts: []
  });

  // Await wallet iframe readiness when needed
  const awaitWalletIframeIfNeeded = useCallback(async () => {
    await awaitWalletIframeReady(tatchi);
  }, [tatchi]);

  // Load recent accounts and determine account info
  const refreshAccountData = useCallback(async () => {
    try {
      await awaitWalletIframeIfNeeded();
      const { accountIds, lastUsedAccount } = await tatchi.getRecentLogins();

      let lastUsername = '';
      let lastDomain = '';

      if (lastUsedAccount) {
        const parts = lastUsedAccount.nearAccountId.split('.');
        lastUsername = parts[0];
        lastDomain = `.${parts.slice(1).join('.')}`;
      }

      setState(prevState => ({
        ...prevState,
        indexDBAccounts: accountIds,
        lastLoggedInUsername: lastUsername,
        lastLoggedInDomain: lastDomain
      }));

    } catch (error) {
      console.warn('Error loading account data:', error);
    }
  }, [tatchi]);

  // Update derived state when inputs change
  const updateDerivedState = useCallback((username: string, accounts: string[]) => {
    // Normalize username to lowercase to avoid iOS autocapitalize causing invalid NEAR IDs
    const uname = (username || '').toLowerCase();
    if (!username.trim()) {
      setState(prevState => ({
        ...prevState,
        targetAccountId: '',
        displayPostfix: '',
        isUsingExistingAccount: false,
        accountExists: false
      }));
      return;
    }

    // Check if username matches any existing account in IndexDB
    const existingAccount = accounts.find(accountId =>
      accountId.split('.')[0].toLowerCase() === uname
    );

    let targetAccountId: string;
    let displayPostfix: string;
    let isUsingExistingAccount: boolean;

    if (existingAccount) {
      // Use existing account's full ID
      targetAccountId = existingAccount;
      const parts = existingAccount.split('.');
      displayPostfix = `.${parts.slice(1).join('.')}`;
      isUsingExistingAccount = true;
    } else {
      const postfix = contractId;
      targetAccountId = `${uname}.${postfix}`;
      displayPostfix = `.${postfix}`;
      isUsingExistingAccount = false;
    }

    setState(prevState => ({
      ...prevState,
      targetAccountId,
      displayPostfix,
      isUsingExistingAccount
    }));

    // Check if account has credentials
    checkAccountExists(targetAccountId);
  }, [contractId, tatchi]);

  // Check if account has passkey credentials
  const checkAccountExists = useCallback(async (accountId: string) => {
    if (!accountId) {
      setState(prevState => ({ ...prevState, accountExists: false }));
      return;
    }

    try {
      await awaitWalletIframeIfNeeded();
      const hasCredential = await tatchi.hasPasskeyCredential(toAccountId(accountId));
      setState(prevState => ({ ...prevState, accountExists: hasCredential }));
    } catch (error) {
      console.warn('Error checking credentials:', error);
      setState(prevState => ({ ...prevState, accountExists: false }));
    }
  }, [tatchi]);

  // Handle username input changes
  const setInputUsername = useCallback((username: string) => {
    const uname = (username || '').toLowerCase();
    setState(prevState => ({ ...prevState, inputUsername: uname }));
    updateDerivedState(uname, state.indexDBAccounts);
  }, [state.indexDBAccounts, updateDerivedState]);

  // onInitialMount: Load last logged in user and prefill
  useEffect(() => {
    const initializeAccountInput = async () => {
      await refreshAccountData();

      if (isLoggedIn && currentNearAccountId) {
        // User is logged in, show their username
        const username = currentNearAccountId.split('.')[0];
        setState(prevState => ({ ...prevState, inputUsername: username }));
      } else {
        // No logged-in user, try to get last used account
        await awaitWalletIframeIfNeeded();
        const { lastUsedAccount } = await tatchi.getRecentLogins();
        if (lastUsedAccount) {
          const username = lastUsedAccount.nearAccountId.split('.')[0];
          setState(prevState => ({ ...prevState, inputUsername: username }));
        }
      }
    };

    initializeAccountInput();
  }, [tatchi, isLoggedIn, currentNearAccountId, tatchi]);

  // onLogout: Reset to last used account
  useEffect(() => {
    const handleLogoutReset = async () => {
      // Only reset if user just logged out (isLoggedIn is false but we had a nearAccountId before)
      if (!isLoggedIn && !currentNearAccountId) {
        try {
          await awaitWalletIframeIfNeeded();
          const { lastUsedAccount } = await tatchi.getRecentLogins();
          if (lastUsedAccount) {
            const username = lastUsedAccount.nearAccountId.split('.')[0];
            setState(prevState => ({ ...prevState, inputUsername: username }));
          }
        } catch (error) {
          console.warn('Error resetting username after logout:', error);
        }
      }
    };

    handleLogoutReset();
  }, [isLoggedIn, currentNearAccountId, tatchi]);

  // Update derived state when dependencies change
  useEffect(() => {
    updateDerivedState(state.inputUsername, state.indexDBAccounts);
  }, [state.inputUsername, state.indexDBAccounts, updateDerivedState]);

  return {
    ...state,
    setInputUsername,
    refreshAccountData
  };
}
