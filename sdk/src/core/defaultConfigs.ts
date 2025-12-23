import type { EmailRecoveryContracts, TatchiConfigs, TatchiConfigsInput } from './types/tatchi';

// Default SDK configs suitable for local dev.
// Cross-origin wallet isolation is recommended; set iframeWallet in your app config when you have a dedicated origin.
// Consumers can shallow-merge overrides by field.

export const PASSKEY_MANAGER_DEFAULT_CONFIGS: TatchiConfigs = {
  // You can provide a single URL or a comma-separated list for failover.
  // First URL is treated as primary, subsequent URLs are fallbacks.
  // nearRpcUrl: 'https://rpc.testnet.near.org',
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  nearNetwork: 'testnet',
  contractId: 'w3a-v1.testnet',
  nearExplorerUrl: 'https://testnet.nearblocks.io',
  // Warm signing session defaults used by login/unlock flows.
  // Enforcement (TTL/uses) is owned by the VRF worker; signer workers remain one-shot.
  signingSessionDefaults: {
    ttlMs: 0, // 0 minutes
    remainingUses: 0, // default to requiring a touchID prompt for each transaction
  },
  relayer: {
    // accountId: 'w3a-v1.testnet',
    // No default relayer URL. Force apps to configure via env/overrides.
    // Using an empty string triggers early validation errors in code paths that require it.
    url: '',
    delegateActionRoute: '/signed-delegate',
    emailRecovery: {
      // Require at least 0.01 NEAR available to start email recovery.
      minBalanceYocto: '10000000000000000000000', // 0.01 NEAR
      // Poll every 4 seconds for verification status / access key.
      pollingIntervalMs: 4000,
      // Stop polling after 30 minutes.
      maxPollingDurationMs: 30 * 60 * 1000,
      // Expire pending recovery records after 30 minutes.
      pendingTtlMs: 30 * 60 * 1000,
      // Default recovery mailbox for examples / docs.
      mailtoAddress: 'recover@web3authn.org',
      // EmailDKIMVerifier contract that stores verification results.
      dkimVerifierAccountId: 'email-dkim-verifier-v1.testnet',
      // View method used to fetch VerificationResult by request_id.
      verificationViewMethod: 'get_verification_result',
    },
  },
  vrfWorkerConfigs: {
    shamir3pass: {
      // default Shamir's P in vrf-wasm-worker, needs to match relay server's Shamir P
      p: '3N5w46AIGjGT2v5Vua_TMD5Ywfa9U2F7-WzW8SNDsIM',
      // No default relay server URL to avoid accidental localhost usage in non-dev envs
      // Defaults to relayer.url when undefined
      relayServerUrl: '',
      applyServerLockRoute: '/vrf/apply-server-lock',
      removeServerLockRoute: '/vrf/remove-server-lock',
    }
  },
  emailRecoveryContracts: {
    emailRecovererGlobalContract: 'w3a-email-recoverer-v1.testnet',
    zkEmailVerifierContract: 'zk-email-verifier-v1.testnet',
    emailDkimVerifierContract: 'email-dkim-verifier-v1.testnet',
  },
  // Configure iframeWallet in application code to point at your dedicated wallet origin when available.
  iframeWallet: {
    walletOrigin: 'https://wallet.example.localhost',
    walletServicePath: '/wallet-service',
    sdkBasePath: '/sdk',
    rpIdOverride: 'example.localhost',
  }
};

export const DEFAULT_EMAIL_RECOVERY_CONTRACTS: EmailRecoveryContracts = {
  emailRecovererGlobalContract: PASSKEY_MANAGER_DEFAULT_CONFIGS.emailRecoveryContracts.emailDkimVerifierContract,
  zkEmailVerifierContract: PASSKEY_MANAGER_DEFAULT_CONFIGS.emailRecoveryContracts.zkEmailVerifierContract,
  emailDkimVerifierContract: PASSKEY_MANAGER_DEFAULT_CONFIGS.emailRecoveryContracts.emailDkimVerifierContract,
};

// Merge defaults with overrides
export function buildConfigsFromEnv(overrides: TatchiConfigsInput = {}): TatchiConfigs {

  const defaults = PASSKEY_MANAGER_DEFAULT_CONFIGS;
  const relayerUrl = overrides.relayer?.url ?? defaults.relayer?.url ?? '';
  // Prefer explicit override for relayer URL; fall back to default preset.
  // Used below to default VRF relayServerUrl when it is undefined.
  const relayServerUrlDefault = relayerUrl;

  const merged: TatchiConfigs = {
    nearRpcUrl: overrides.nearRpcUrl ?? defaults.nearRpcUrl,
    nearNetwork: overrides.nearNetwork ?? defaults.nearNetwork,
    contractId: overrides.contractId ?? defaults.contractId,
    nearExplorerUrl: overrides.nearExplorerUrl ?? defaults.nearExplorerUrl,
    walletTheme: overrides.walletTheme ?? defaults.walletTheme,
    signingSessionDefaults: {
      ttlMs: overrides.signingSessionDefaults?.ttlMs
        ?? defaults.signingSessionDefaults?.ttlMs,
      remainingUses: overrides.signingSessionDefaults?.remainingUses
        ?? defaults.signingSessionDefaults?.remainingUses,
    },
    relayer: {
      url: relayerUrl,
      delegateActionRoute: overrides.relayer?.delegateActionRoute
        ?? defaults.relayer?.delegateActionRoute,
      emailRecovery: {
        minBalanceYocto: overrides.relayer?.emailRecovery?.minBalanceYocto
          ?? defaults.relayer?.emailRecovery?.minBalanceYocto,
        pollingIntervalMs: overrides.relayer?.emailRecovery?.pollingIntervalMs
          ?? defaults.relayer?.emailRecovery?.pollingIntervalMs,
        maxPollingDurationMs: overrides.relayer?.emailRecovery?.maxPollingDurationMs
          ?? defaults.relayer?.emailRecovery?.maxPollingDurationMs,
        pendingTtlMs: overrides.relayer?.emailRecovery?.pendingTtlMs
          ?? defaults.relayer?.emailRecovery?.pendingTtlMs,
        mailtoAddress: overrides.relayer?.emailRecovery?.mailtoAddress
          ?? defaults.relayer?.emailRecovery?.mailtoAddress,
        dkimVerifierAccountId: overrides.relayer?.emailRecovery?.dkimVerifierAccountId
          ?? defaults.relayer?.emailRecovery?.dkimVerifierAccountId,
        verificationViewMethod: overrides.relayer?.emailRecovery?.verificationViewMethod
          ?? defaults.relayer?.emailRecovery?.verificationViewMethod,
      },
    },
    authenticatorOptions: overrides.authenticatorOptions ?? defaults.authenticatorOptions,
    vrfWorkerConfigs: {
      shamir3pass: {
        p: overrides.vrfWorkerConfigs?.shamir3pass?.p
          ?? defaults.vrfWorkerConfigs?.shamir3pass?.p,
        relayServerUrl: overrides.vrfWorkerConfigs?.shamir3pass?.relayServerUrl
          ?? defaults.vrfWorkerConfigs?.shamir3pass?.relayServerUrl
          ?? relayServerUrlDefault,
        applyServerLockRoute: overrides.vrfWorkerConfigs?.shamir3pass?.applyServerLockRoute
          ?? defaults.vrfWorkerConfigs?.shamir3pass?.applyServerLockRoute,
        removeServerLockRoute: overrides.vrfWorkerConfigs?.shamir3pass?.removeServerLockRoute
          ?? defaults.vrfWorkerConfigs?.shamir3pass?.removeServerLockRoute,
      },
    },
    emailRecoveryContracts: {
      emailRecovererGlobalContract: overrides.emailRecoveryContracts?.emailRecovererGlobalContract
        ?? defaults.emailRecoveryContracts?.emailRecovererGlobalContract,
      zkEmailVerifierContract: overrides.emailRecoveryContracts?.zkEmailVerifierContract
        ?? defaults.emailRecoveryContracts?.zkEmailVerifierContract,
      emailDkimVerifierContract: overrides.emailRecoveryContracts?.emailDkimVerifierContract
        ?? defaults.emailRecoveryContracts?.emailDkimVerifierContract,
    },
    iframeWallet: {
      walletOrigin: overrides.iframeWallet?.walletOrigin
        ?? defaults.iframeWallet?.walletOrigin,
      walletServicePath: overrides.iframeWallet?.walletServicePath
        ?? defaults.iframeWallet?.walletServicePath
        ?? '/wallet-service',
      sdkBasePath: overrides.iframeWallet?.sdkBasePath
        ?? defaults.iframeWallet?.sdkBasePath
        ?? '/sdk',
      rpIdOverride: overrides.iframeWallet?.rpIdOverride
        ?? defaults.iframeWallet?.rpIdOverride,
    }
  };
  if (!merged.contractId) {
    throw new Error('[configPresets] Missing required config: contractId');
  }
  if (!merged.relayer.url) {
    throw new Error('[configPresets] Missing required config: relayer.url');
  }
  return merged;
}
