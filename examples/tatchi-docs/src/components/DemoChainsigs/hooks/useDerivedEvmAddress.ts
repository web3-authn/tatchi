import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useTatchi } from '@tatchi-xyz/sdk/react';
import { createEvmAdapter, deriveEvmAddress } from './helpers/adapters';
import { Hex, ensure0x } from './helpers/evm';

export function useDerivedEvmAddress() {
  const { tatchi } = useTatchi();
  const [address, setAddress] = useState<Hex>();
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
        await tatchi.setDerivedAddress(nearAccountId, {
          contractId,
          path: `evm:${chainId}:${path}`,
          address: hex,
        });
      } catch {}
      return hex as string;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)) || 'Failed to derive address';
      toast.error(`Derive address failed: ${msg}`, {
        description: 'Try setting an RPC override (e.g. https://ethereum-sepolia.publicnode.com) or check network access.',
      });
      throw e;
    } finally {
      setLoading(false);
    }
  }, [tatchi]);

  const loadCached = useCallback(async (params: {
    nearAccountId: string;
    chainId: number;
    contractId: string;
    path: string;
  }) => {
    const { nearAccountId, chainId, contractId, path } = params;
    try {
      const cached = await tatchi.getDerivedAddress(nearAccountId, {
        contractId,
        path: `evm:${chainId}:${path}`,
      });
      const addr = cached || '';
      if (addr) setAddress(ensure0x(addr));
      return addr;
    } catch {
      return '';
    }
  }, [tatchi]);

  return { address, loading, setAddress, deriveAndCache, loadCached } as const;
}
