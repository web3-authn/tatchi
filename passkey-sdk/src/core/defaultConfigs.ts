import type { PasskeyManagerConfigs } from './types/passkeyManager';

// Default SDK configs suitable for local dev.
// Cross-origin wallet isolation is recommended; set iframeWallet in your app config when you have a dedicated origin.
// Consumers can shallow-merge overrides by field.
export const PASSKEY_MANAGER_DEFAULT_CONFIGS: PasskeyManagerConfigs = {
  // You can provide a single URL or a comma-separated list for failover.
  // First URL is treated as primary, subsequent URLs are fallbacks.
  // nearRpcUrl: 'https://rpc.testnet.near.org',
  nearRpcUrl: 'https://test.rpc.fastnear.com,https://rpc.testnet.near.org',
  nearNetwork: 'testnet' as const,
  contractId: 'web3-authn-v5.testnet',
  nearExplorerUrl: 'https://testnet.nearblocks.io',
  relayer: {
    accountId: 'web3-authn-v5.testnet',
    url: 'http://localhost:3000',
  },
  vrfWorkerConfigs: {
    shamir3pass: {
      // default Shamir's P in vrf-wasm-worker, needs to match relay server's Shamir P
      p: '3N5w46AIGjGT2v5Vua_TMD5Ywfa9U2F7-WzW8SNDsIM',
      relayServerUrl: 'http://localhost:3000',
      applyServerLockRoute: '/vrf/apply-server-lock',
      removeServerLockRoute: '/vrf/remove-server-lock',
    }
  }
  ,
  // Configure iframeWallet in application code to point at your dedicated wallet origin when available.
  // Example:
  // iframeWallet: {
  //   walletOrigin: 'https://wallet.example.localhost',
  //   walletServicePath: '/wallet-service',
  //   rpIdOverride: 'example.localhost',
  // }
};
