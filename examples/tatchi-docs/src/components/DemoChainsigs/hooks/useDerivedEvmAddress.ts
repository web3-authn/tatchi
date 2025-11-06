import { useCallback, useState } from 'react';
import { usePasskeyContext } from '@tatchi-xyz/sdk/react';
import { createEvmAdapter, deriveEvmAddress } from './helpers/adapters';
import { ensure0x } from './helpers/evm';

export function useDerivedEvmAddress() {
  const { passkeyManager } = usePasskeyContext();
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const deriveAndCache = useCallback(async (params: {
    nearAccountId: string;
    chainId: number;
    contractId: string;
    path: string;
    rpcOverride?: string;
  }) => {
    const { nearAccountId, chainId, contractId, path, rpcOverride } = params;
    setLoading(true);
    try {
      const { evm } = await createEvmAdapter({ chainId, contractId, rpcOverride });
      const hex = await deriveEvmAddress(evm, nearAccountId, path);
      setAddress(hex);
      try {
        await passkeyManager.setDerivedAddress(nearAccountId, {
          contractId,
          path: `evm:${chainId}:${path}`,
          address: hex,
        });
      } catch {}
      return hex as string;
    } finally {
      setLoading(false);
    }
  }, [passkeyManager]);

  const loadCached = useCallback(async (params: {
    nearAccountId: string;
    chainId: number;
    contractId: string;
    path: string;
  }) => {
    const { nearAccountId, chainId, contractId, path } = params;
    try {
      const cached = await passkeyManager.getDerivedAddress(nearAccountId, {
        contractId,
        path: `evm:${chainId}:${path}`,
      });
      const addr = cached || '';
      if (addr) setAddress(ensure0x(addr).toLowerCase());
      return addr;
    } catch {
      return '';
    }
  }, [passkeyManager]);

  return { address, loading, setAddress, deriveAndCache, loadCached } as const;
}
