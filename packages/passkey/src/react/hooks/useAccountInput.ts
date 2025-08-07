import { useState, useEffect, useCallback } from 'react';
import {
  type PasskeyManager,
  toAccountId
} from '@/index';

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
  passkeyManager: PasskeyManager;
  relayerAccount: string;
  useRelayer: boolean;
  currentNearAccountId?: string | null;
  isLoggedIn: boolean;
}

export interface UseAccountInputReturn extends AccountInputState {
  setInputUsername: (username: string) => void;
  refreshAccountData: () => Promise<void>;
}

export function useAccountInput({
  passkeyManager,
  relayerAccount,
  useRelayer,
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

  // Load IndexDB accounts and determine account info
  const refreshAccountData = useCallback(async () => {
    try {
      const { accountIds, lastUsedAccountId } = await passkeyManager.getRecentLogins();

      let lastUsername = '';
      let lastDomain = '';

      if (lastUsedAccountId) {

        const parts = lastUsedAccountId.nearAccountId.split('.');
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
  }, [passkeyManager]);

  // Update derived state when inputs change
  const updateDerivedState = useCallback((username: string, accounts: string[]) => {
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
      accountId.split('.')[0].toLowerCase() === username.toLowerCase()
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
      // New account: use relayer or testnet based on useRelayer setting
      const postfix = useRelayer ? relayerAccount : 'testnet';
      targetAccountId = `${username}.${postfix}`;
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
  }, [useRelayer, relayerAccount, passkeyManager]);

  // Check if account has passkey credentials
  const checkAccountExists = useCallback(async (accountId: string) => {
    if (!accountId) {
      setState(prevState => ({ ...prevState, accountExists: false }));
      return;
    }

    try {
      const hasCredential = await passkeyManager.hasPasskeyCredential(toAccountId(accountId));
      setState(prevState => ({ ...prevState, accountExists: hasCredential }));
    } catch (error) {
      console.warn('Error checking credentials:', error);
      setState(prevState => ({ ...prevState, accountExists: false }));
    }
  }, [passkeyManager]);

  // Handle username input changes
  const setInputUsername = useCallback((username: string) => {
    setState(prevState => ({ ...prevState, inputUsername: username }));
    updateDerivedState(username, state.indexDBAccounts);
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
        const { lastUsedAccountId } = await passkeyManager.getRecentLogins();
        if (lastUsedAccountId) {
          const username = lastUsedAccountId.nearAccountId.split('.')[0];
          setState(prevState => ({ ...prevState, inputUsername: username }));
        }
      }
    };

    initializeAccountInput();
  }, [passkeyManager, isLoggedIn, currentNearAccountId, passkeyManager]);

  // onLogout: Reset to last used account
  useEffect(() => {
    const handleLogoutReset = async () => {
      // Only reset if user just logged out (isLoggedIn is false but we had a nearAccountId before)
      if (!isLoggedIn && !currentNearAccountId) {
        try {
        const { lastUsedAccountId } = await passkeyManager.getRecentLogins();
          if (lastUsedAccountId) {
            const username = lastUsedAccountId.nearAccountId.split('.')[0];
            setState(prevState => ({ ...prevState, inputUsername: username }));
          }
        } catch (error) {
          console.warn('Error resetting username after logout:', error);
        }
      }
    };

    handleLogoutReset();
  }, [isLoggedIn, currentNearAccountId, passkeyManager]);

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
