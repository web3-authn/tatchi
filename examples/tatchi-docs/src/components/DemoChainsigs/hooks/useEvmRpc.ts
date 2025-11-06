import * as viem from 'viem'

export function rpcForChainId(chainId: number): string | null {
  switch (chainId) {
    case 11155111: // Ethereum Sepolia
      return 'https://sepolia.gateway.tenderly.co';
    case 84532: // Base Sepolia
      return 'https://sepolia.base.org';
    case 80002: // Polygon Amoy
      return 'https://rpc-amoy.polygon.technology';
    case 43113: // Avalanche Fuji
      return 'https://api.avax-test.network/ext/bc/C/rpc';
    case 97: // BSC testnet
      return 'https://data-seed-prebsc-1-s1.binance.org:8545/';
    case 421614: // Arbitrum Sepolia
      return 'https://sepolia-rollup.arbitrum.io/rpc';
    default:
      return null;
  }
}

export function rpcCandidatesForChainId(chainId: number): string[] {
  switch (chainId) {
    case 11155111: // Ethereum Sepolia
      return [
        'https://sepolia.gateway.tenderly.co',
        'https://rpc.sepolia.org',
        'https://ethereum-sepolia.publicnode.com',
        'https://eth-sepolia.g.alchemy.com/v2/demo',
      ];
    case 84532: // Base Sepolia
      return [
        'https://sepolia.base.org',
        'https://base-sepolia.gateway.tenderly.co',
      ];
    case 80002: // Polygon Amoy
      return ['https://rpc-amoy.polygon.technology'];
    case 43113: // Avalanche Fuji
      return ['https://api.avax-test.network/ext/bc/C/rpc'];
    case 97: // BSC testnet
      return ['https://data-seed-prebsc-1-s1.binance.org:8545/'];
    case 421614: // Arbitrum Sepolia
      return ['https://sepolia-rollup.arbitrum.io/rpc'];
    default:
      return [];
  }
}

/**
 * Probe a set of RPC URLs and return the first responsive endpoint.
 * A manual override takes precedence when provided.
 */
export async function chooseRpc(chainId: number, override?: string): Promise<string> {
  if (override && override.trim()) return override.trim();
  const first = rpcForChainId(chainId);
  const candidates = [first, ...rpcCandidatesForChainId(chainId)].filter(Boolean) as string[];
  for (const url of candidates) {
    try {
      const client = viem.createPublicClient({ transport: viem.http(url, { timeout: 8000 }) });
      await client.getBlockNumber();
      return url;
    } catch {
      // try next
    }
  }
  throw new Error('No responsive RPC for selected chain. Provide an override.');
}
