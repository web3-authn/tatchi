export function faucetLinksForChainId(chainId: number): Array<{ label: string; url: string }> {
  switch (chainId) {
    case 11155111: // Ethereum Sepolia
      return [
        { label: 'Alchemy Sepolia Faucet', url: 'https://www.alchemy.com/faucets/ethereum-sepolia' },
        { label: 'DRPC Sepolia Faucet', url: 'https://drpc.org/faucet/ethereum/sepolia' },
        { label: 'Infura Sepolia Faucet', url: 'https://www.infura.io/faucet/sepolia' },
      ];
    case 84532: // Base Sepolia
      return [
        { label: 'Alchemy Base Sepolia Faucet', url: 'https://www.alchemy.com/faucets/base-sepolia' },
        { label: 'QuickNode Base Sepolia Faucet', url: 'https://faucet.quicknode.com/base/sepolia' },
      ];
    case 80002: // Polygon Amoy
      return [
        { label: 'Alchemy Polygon Amoy Faucet', url: 'https://www.alchemy.com/faucets/polygon-amoy' },
      ];
    case 43113: // Avalanche Fuji
      return [
        { label: 'Avalanche Fuji Faucet', url: 'https://core.app/tools/testnet-faucet/?subnet=c&token=c' },
      ];
    case 97: // BSC testnet
      return [
        { label: 'BSC Testnet Faucet', url: 'https://testnet.bnbchain.org/faucet-smart' },
      ];
    case 421614: // Arbitrum Sepolia
      return [
        { label: 'QuickNode Arbitrum Sepolia Faucet', url: 'https://faucet.quicknode.com/arbitrum/sepolia' },
      ];
    default:
      return [
        { label: 'Chainlist (find faucet)', url: 'https://chainlist.org/?testnets=true' },
      ];
  }
}

export function explorerTxBaseForChainId(chainId: number): string | null {
  switch (chainId) {
    case 11155111: // Ethereum Sepolia
      return 'https://sepolia.etherscan.io/tx/';
    case 84532: // Base Sepolia
      return 'https://sepolia.basescan.org/tx/';
    case 80002: // Polygon Amoy
      return 'https://www.oklink.com/amoy/tx/';
    case 43113: // Avalanche Fuji
      return 'https://subnets-test.avax.network/c-chain/tx/';
    case 97: // BSC testnet
      return 'https://testnet.bscscan.com/tx/';
    case 421614: // Arbitrum Sepolia
      return 'https://sepolia.arbiscan.io/tx/';
    default:
      return null;
  }
}

export function base64ToBytes(b64: string): Uint8Array {
  try {
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
  } catch {}
  // Fallback (Node-style)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Buf: any = (globalThis as any).Buffer;
  if (Buf && typeof Buf.from === 'function') {
    return new Uint8Array(Buf.from(b64, 'base64'));
  }
  throw new Error('No base64 decoder available in this environment');
}

