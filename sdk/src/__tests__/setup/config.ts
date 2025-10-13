import type { PasskeyTestConfig } from './types';

const FRONTEND_URL = (process.env.NO_CADDY === '1' || process.env.CI === '1')
  ? 'http://localhost:5174'
  : 'https://example.localhost';

export const DEFAULT_TEST_CONFIG: PasskeyTestConfig = {
  frontendUrl: FRONTEND_URL,
  nearNetwork: 'testnet',
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  contractId: 'w3a-v1.testnet',
  relayerAccount: 'w3a-v1.testnet',
  rpId: 'localhost',
  useRelayer: true,
  relayer: {
    url: 'http://localhost:3000',
  },
  testReceiverAccountId: 'w3a-v1.testnet',
};
