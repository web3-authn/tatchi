import { useRef, useState, useEffect } from 'react';
import { WEBAUTHN_CONTRACT_ID } from '../config';
import { useNearClient } from '@tatchi-xyz/sdk/react';
import { useTatchi } from '@tatchi-xyz/sdk/react/context';

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

export const useSetGreeting = (): SetGreetingHook => {
  const { tatchi } = useTatchi();
  const nearClient = useNearClient(tatchi.configs.nearRpcUrl);
  const [onchainGreeting, setOnchainGreeting] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Instance-level flag for this specific hook instance
  const isCurrentlyFetching = useRef<boolean>(false);
  const hasFetchedOnMount = useRef<boolean>(false);

  const normalizeGreeting = (result: unknown): string | null => {
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object') {
      const v = (result as { greeting?: unknown; message?: unknown; hello?: unknown });
      if (typeof v.greeting === 'string') return v.greeting;
      if (typeof v.message === 'string') return v.message;
      if (typeof v.hello === 'string') return v.hello;
    }
    return null;
  };

  const fetchGreeting = async (): Promise<GreetingResult> => {
    // Instance-level concurrent protection
    if (isCurrentlyFetching.current) {
      return { success: false, error: 'Already fetching' };
    }

    isCurrentlyFetching.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Prefer get_hello (newer contract shape); fall back to get_greeting for older deployments.
      let raw: unknown;
      try {
        raw = await nearClient.view<unknown>({
          account: WEBAUTHN_CONTRACT_ID,
          method: 'get_hello',
          args: {},
        });
      } catch {
        raw = await nearClient.view<unknown>({
          account: WEBAUTHN_CONTRACT_ID,
          method: 'get_greeting',
          args: {},
        });
      }

      const greeting = normalizeGreeting(raw);
      setOnchainGreeting(greeting);
      return { success: true, greeting: greeting ?? undefined };
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
    }
  };

  // Auto-fetch greeting on mount with protection against React StrictMode double-mounting
  useEffect(() => {
    if (hasFetchedOnMount.current) {
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
