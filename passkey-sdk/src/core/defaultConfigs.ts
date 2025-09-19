import type { PasskeyManagerConfigs } from './types/passkeyManager';

// Default SDK configs suitable for local dev in same‑origin (App Wallet) mode.
// Consumers can shallow‑merge overrides by field.
export const PASSKEY_MANAGER_DEFAULT_CONFIGS: PasskeyManagerConfigs = {
  // nearRpcUrl: 'https://rpc.testnet.near.org',
  nearRpcUrl: 'https://test.rpc.fastnear.com',
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
  // By default, use same‑origin mode. To enable cross‑origin wallet service, set:
  // iframeWallet: {
  //   walletOrigin: 'https://wallet.example.localhost',
  //   walletServicePath: '/wallet-service',
  //   rpIdOverride: 'example.localhost',
  // }
};
