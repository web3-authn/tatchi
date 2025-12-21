/**
 * Shared test configuration for Passkey/VRF e2e-style tests.
 *
 * In the VRF v2 architecture:
 * - These values are threaded into the TatchiPasskey instance and ultimately
 *   into WebAuthnManager, NearClient, and the VRF worker configuration.
 * - `nearRpcUrl` / `contractId` are used by both confirmTxFlow and VRF worker
 *   to fetch NEAR context and generate VRF challenges consistently.
 */
export interface PasskeyTestConfig {
  frontendUrl: string;
  nearNetwork: 'testnet' | 'mainnet';
  nearRpcUrl: string;
  contractId: string;
  relayerAccount: string;
  rpId: string;
  useRelayer: boolean;
  relayer?: {
    url: string;
  };
  relayServerUrl?: string;
  testReceiverAccountId: string;
}

export type PasskeyTestConfigOverrides = Partial<PasskeyTestConfig>;

// Optional test-only toggles that control cross-origin shims in setupBasicPasskeyTest
export type PasskeyTestSetupOptions = PasskeyTestConfigOverrides & {
  /**
   * When true, force Worker() URLs to same-origin to avoid cross-origin restrictions in tests.
   * Defaults to the env var W3A_FORCE_SAME_ORIGIN_WORKERS !== '0' (true when unset).
   */
  forceSameOriginWorkers?: boolean
  /**
   * When true, pins window.__W3A_WALLET_SDK_BASE__ to the app origin /sdk/ during tests.
   * Defaults to the same value as forceSameOriginWorkers when undefined.
   */
  forceSameOriginSdkBase?: boolean
  /**
   * When true, skip dynamic loading of TatchiPasskey + global fallback injection.
   * Useful for lightweight lit-component tests that only need the import map.
   */
  skipPasskeyManagerInit?: boolean
};
