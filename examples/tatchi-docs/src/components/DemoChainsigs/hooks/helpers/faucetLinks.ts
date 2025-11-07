export function faucetLinksForChainId(chainId: number): Array<{ label: string; url: string }> {
  switch (chainId) {
    case 11155111: // Ethereum Sepolia
      return [
        { label: 'Google ETH Faucet', url: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia' },
        { label: 'PoW ETH Faucet', url: 'https://sepolia-faucet.pk910.de/' },
      ];
    case 84532: // Base Sepolia
      return [
        { label: 'Alchemy Base Faucet', url: 'https://www.alchemy.com/faucets/base-sepolia' },
        { label: 'QuickNode Base Faucet', url: 'https://faucet.quicknode.com/base/sepolia' },
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
