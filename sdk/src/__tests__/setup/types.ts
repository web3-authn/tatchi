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
};
