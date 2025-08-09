import type { AuthServiceConfig } from './types';

export function validateConfigs(config: AuthServiceConfig): void {

  const requiredConfigVars = [
    'relayerAccountId',
    'relayerPrivateKey',
    'webAuthnContractId',
    'shamir_p_b64u',
    'shamir_e_s_b64u',
    'shamir_d_s_b64u',
  ];

  for (const key of requiredConfigVars) {
    if (!config[key as keyof AuthServiceConfig]) {
      throw new Error(`Missing required config variable: ${key}`);
    }
  }

  // Validate private key format
  if (!config.relayerPrivateKey?.startsWith('ed25519:')) {
    throw new Error('Relayer private key must be in format "ed25519:base58privatekey"');
  }
}

