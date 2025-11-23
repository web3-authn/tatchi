import * as viem from 'viem';
import { chainAdapters, contracts } from 'chainsig.js';
import { chooseRpc } from '../useEvmRpc';
import { Hex, ensure0x } from './evm';

export async function createEvmAdapter(params: {
  chainId: number;
  contractId: string;
  rpcOverride?: string;
  networkId?: 'testnet' | 'mainnet';
}) {
  const { chainId, contractId, rpcOverride, networkId = 'testnet' } = params;
  const rpcUrl = await chooseRpc(chainId, rpcOverride);
  const publicClient = viem.createPublicClient({ transport: viem.http(rpcUrl, { timeout: 20000 }) });
  const contract = new contracts.ChainSignatureContract({ networkId, contractId });
  const evm = new chainAdapters.evm.EVM({ publicClient, contract });
  return { rpcUrl, publicClient, contract, evm } as const;
}

export async function deriveEvmAddress(evm: any, nearAccountId: string, path: string): Promise<Hex> {
  const { address } = await evm.deriveAddressAndPublicKey(nearAccountId, path);
  return ensure0x(address.toLowerCase());
}
