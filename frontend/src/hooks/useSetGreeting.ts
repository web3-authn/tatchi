import { useRef, useState, useEffect } from 'react';
import { WEBAUTHN_CONTRACT_ID } from '../config';
import { useNearClient } from '@web3authn/passkey/react';

export interface GreetingResult {
  success: boolean;
  error?: string;
  greeting?: string;
}

interface SetGreetingHook {
  onchainGreeting: string | null;
  isLoading: boolean;
  error: string | null;
  fetchGreeting: () => Promise<GreetingResult>;
}

// Module-level flag to prevent concurrent requests across all instances
let globalFetchInProgress = false;
let lastGlobalFetchTime = 0;
const MIN_FETCH_INTERVAL = 1000; // 1 second minimum between fetches

export const useSetGreeting = (): SetGreetingHook => {
  const nearClient = useNearClient();
  const [onchainGreeting, setOnchainGreeting] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Instance-level flag for this specific hook instance
  const isCurrentlyFetching = useRef<boolean>(false);
  const hasFetchedOnMount = useRef<boolean>(false);

  const fetchGreeting = async (): Promise<GreetingResult> => {
    const now = Date.now();

    // Global concurrent protection
    if (globalFetchInProgress) {
      console.log('Greeting fetch already in progress globally');
      return { success: false, error: 'Already fetching globally' };
    }

    // Rate limiting protection
    if (now - lastGlobalFetchTime < MIN_FETCH_INTERVAL) {
      console.log('Rate limited - too soon since last fetch');
      return { success: false, error: 'Rate limited' };
    }

    // Instance-level concurrent protection
    if (isCurrentlyFetching.current) {
      console.log('Greeting fetch already in progress for this instance');
      return { success: false, error: 'Already fetching' };
    }

    globalFetchInProgress = true;
    isCurrentlyFetching.current = true;
    lastGlobalFetchTime = now;
    setIsLoading(true);
    setError(null);

    try {
      const result = await nearClient.view<string>({
        account: WEBAUTHN_CONTRACT_ID,
        method: 'get_greeting',
        args: {}
      });

      const greeting = result;
      console.log('✅ Greeting fetched successfully:', greeting);
      setOnchainGreeting(greeting);

      return { success: true, greeting };
    } catch (err: any) {
      console.error("Error fetching greeting:", err);
      const errorMessage = err.message || 'Failed to fetch greeting';
      setError(errorMessage);

      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setIsLoading(false);
      isCurrentlyFetching.current = false;
      globalFetchInProgress = false;
    }
  };

  // Auto-fetch greeting on mount with protection against React StrictMode double-mounting
  useEffect(() => {
    if (hasFetchedOnMount.current) {
      console.log('Skipping duplicate mount fetch due to React StrictMode');
      return;
    }

    hasFetchedOnMount.current = true;

    const loadInitialGreeting = async () => {
      await fetchGreeting();
    };
    loadInitialGreeting();
  }, []); // Empty dependency array - only run on mount

  return {
    onchainGreeting,
    isLoading,
    error,
    fetchGreeting
  };
};