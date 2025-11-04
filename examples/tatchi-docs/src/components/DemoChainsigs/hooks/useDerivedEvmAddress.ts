import { useCallback, useState } from 'react';
import { usePasskeyContext } from '@tatchi-xyz/sdk/react';
import { chainAdapters, contracts } from 'chainsig.js';
import * as viem from 'viem';
import { chooseRpc } from './useEvmRpc';

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
      const rpcUrl = await chooseRpc(chainId, rpcOverride);
      const publicClient = viem.createPublicClient({ transport: viem.http(rpcUrl, { timeout: 20000 }) });
      const contract = new contracts.ChainSignatureContract({ networkId: 'testnet', contractId });
      const evm = new chainAdapters.evm.EVM({ publicClient, contract });
      const { address } = await evm.deriveAddressAndPublicKey(nearAccountId, path);
      const hex = (address.startsWith('0x') ? address : `0x${address}`).toLowerCase();
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
      if (addr) setAddress(addr.toLowerCase());
      return addr;
    } catch {
      return '';
    }
  }, [passkeyManager]);

  return { address, loading, setAddress, deriveAndCache, loadCached } as const;
}

