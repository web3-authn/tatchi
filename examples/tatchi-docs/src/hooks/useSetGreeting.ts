import { useRef, useState, useEffect } from 'react';
import { useNearClient, useTatchi } from '@tatchi-xyz/sdk/react';

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
  // StrictMode-safe guard to run initial fetch once
  const didInit = useRef<boolean>(false);

  const fetchGreeting = async (): Promise<GreetingResult> => {
    // Instance-level concurrent protection
    if (isCurrentlyFetching.current) {
      return { success: false, error: 'Already fetching' };
    }

    isCurrentlyFetching.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const contractId = tatchi.configs.contractId;
      if (!contractId) {
        const msg = 'Missing contractId in Tatchi configs';
        setError(msg);
        return { success: false, error: msg };
      }
      const result = await nearClient.view<string>({
        account: contractId,
        method: 'get_greeting',
        args: {}
      });
      const greeting = result ?? null;
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
    }
  };

  // Auto-fetch greeting on mount with protection against React StrictMode double-mounting
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void fetchGreeting();
  }, []); // Empty dependency array - only run on mount

  return {
    onchainGreeting,
    isLoading,
    error,
    fetchGreeting
  };
};
