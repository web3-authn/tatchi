import type { PasskeyTestConfig } from './types';

export const DEFAULT_TEST_CONFIG: PasskeyTestConfig = {
  frontendUrl: 'https://example.localhost',
  nearNetwork: 'testnet',
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  contractId: 'web3-authn-v5.testnet',
  relayerAccount: 'web3-authn-v5.testnet',
  rpId: 'localhost',
  useRelayer: true,
  relayer: {
    url: 'http://localhost:3000',
  },
  testReceiverAccountId: 'web3-authn-v5.testnet',
};
