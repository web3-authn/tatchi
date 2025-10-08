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
