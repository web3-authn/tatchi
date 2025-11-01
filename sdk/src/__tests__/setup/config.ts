import type { PasskeyTestConfig } from './types';

const FRONTEND_URL = (process.env.NO_CADDY === '1' || process.env.CI === '1')
  ? 'http://localhost:5174'
  : 'https://example.localhost';

// Derive an RP ID that matches the frontend host so the
// WebAuthn mock generates an authenticatorData rpIdHash
// that the contract accepts.
const RP_ID = (() => {
  try {
    const u = new URL(FRONTEND_URL);
    return u.hostname || 'localhost';
  } catch {
    return 'localhost';
  }
})();

export const DEFAULT_TEST_CONFIG: PasskeyTestConfig = {
  frontendUrl: FRONTEND_URL,
  nearNetwork: 'testnet',
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  contractId: 'w3a-v1.testnet',
  relayerAccount: 'w3a-v1.testnet',
  rpId: RP_ID,
  useRelayer: true,
  relayer: {
    url: 'http://localhost:3000',
  },
  testReceiverAccountId: 'w3a-v1.testnet',
};
