import type { PasskeyManagerConfigs } from './types/passkeyManager';

// Default SDK configs suitable for local dev.
// Cross-origin wallet isolation is recommended; set iframeWallet in your app config when you have a dedicated origin.
// Consumers can shallow-merge overrides by field.
export const PASSKEY_MANAGER_DEFAULT_CONFIGS: PasskeyManagerConfigs = {
  // You can provide a single URL or a comma-separated list for failover.
  // First URL is treated as primary, subsequent URLs are fallbacks.
  // nearRpcUrl: 'https://rpc.testnet.near.org',
  nearRpcUrl: 'https://test.rpc.fastnear.com,https://rpc.testnet.near.org',
  nearNetwork: 'testnet',
  webauthnContractId: 'web3-authn-v5.testnet',
  nearExplorerUrl: 'https://testnet.nearblocks.io',
  relayer: {
    accountId: 'web3-authn-v5.testnet',
    // No default relayer URL. Force apps to configure via env/overrides.
    // Using an empty string triggers early validation errors in code paths that require it.
    url: '',
  },
  vrfWorkerConfigs: {
    shamir3pass: {
      // default Shamir's P in vrf-wasm-worker, needs to match relay server's Shamir P
      p: '3N5w46AIGjGT2v5Vua_TMD5Ywfa9U2F7-WzW8SNDsIM',
      // No default relay server URL to avoid accidental localhost usage in non-dev envs
      relayServerUrl: '',
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

// Minimal builder: merge defaults with overrides
export function buildConfigsFromEnv(overrides: Partial<PasskeyManagerConfigs> = {}): PasskeyManagerConfigs {

  const shamir3passDefaults = PASSKEY_MANAGER_DEFAULT_CONFIGS?.vrfWorkerConfigs?.shamir3pass;

  const merged: PasskeyManagerConfigs = {
    ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
    ...overrides,
    webauthnContractId: overrides.webauthnContractId ?? PASSKEY_MANAGER_DEFAULT_CONFIGS.webauthnContractId;
    relayer: {
      accountId: overrides.relayer?.accountId ?? PASSKEY_MANAGER_DEFAULT_CONFIGS.relayer.accountId,
      url: overrides.relayer?.url ?? PASSKEY_MANAGER_DEFAULT_CONFIGS.relayer.url,
    },
    vrfWorkerConfigs: {
      shamir3pass: {
        p: overrides.vrfWorkerConfigs?.shamir3pass?.p
          ?? shamir3passDefaults?.p,
        removeServerLockRoute: overrides.vrfWorkerConfigs?.shamir3pass?.removeServerLockRoute
          ?? shamir3passDefaults?.removeServerLockRoute,
        applyServerLockRoute: overrides.vrfWorkerConfigs?.shamir3pass?.applyServerLockRoute
          ?? shamir3passDefaults?.applyServerLockRoute,
        relayServerUrl: overrides.vrfWorkerConfigs?.shamir3pass?.relayServerUrl
      }
    },
    ...(overrides.iframeWallet ? { iframeWallet: overrides.iframeWallet } : {}),
  } as PasskeyManagerConfigs;

  if (!merged.relayer?.url) {
    throw new Error('[configPresets] Missing relayer config: relayer.url');
  }

  return merged;
}
