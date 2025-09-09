import { useState, useCallback } from 'react';

export interface UseRelayerOptions {
  initialValue?: boolean;
}

export interface UseRelayerReturn {
  useRelayer: boolean;
  setUseRelayer: (value: boolean) => void;
  toggleRelayer: () => void;
}

/**
 * Hook for managing relayer usage state
 *
 * @param options - Configuration options
 * @returns Object with relayer state and setters
 */
export function useRelayer(options: UseRelayerOptions = {}): UseRelayerReturn {
  const { initialValue = false } = options;

  const [useRelayer, setUseRelayer] = useState<boolean>(initialValue);

  const toggleRelayer = useCallback(() => {
    setUseRelayer(prev => !prev);
  }, []);

  return {
    useRelayer,
    setUseRelayer,
    toggleRelayer
  };
}