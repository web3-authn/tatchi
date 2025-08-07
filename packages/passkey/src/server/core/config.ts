import type { AuthServiceConfig } from './types';

export function validateConfigs(config: AuthServiceConfig): void {
  const requiredEnvVars = [
    'relayerAccountId',
    'relayerPrivateKey',
    'webAuthnContractId',
  ];

  for (const key of requiredEnvVars) {
    if (!config[key as keyof AuthServiceConfig]) {
      throw new Error(`Missing required config variable: ${key}`);
    }
  }

  // Validate private key format
  if (!config.relayerPrivateKey?.startsWith('ed25519:')) {
    throw new Error('Relayer private key must be in format "ed25519:base58privatekey"');
  }
}

