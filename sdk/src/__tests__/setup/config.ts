import type { PasskeyTestConfig } from './types';

const FRONTEND_URL = (process.env.NO_CADDY === '1' || process.env.CI === '1')
  ? 'http://localhost:5173'
  : 'https://example.localhost';

export const DEFAULT_TEST_CONFIG: PasskeyTestConfig = {
  frontendUrl: FRONTEND_URL,
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
