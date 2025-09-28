import type { AuthServiceConfig } from './types';

export function validateConfigs(config: AuthServiceConfig): void {

  const requiredTop = ['relayerAccountId','relayerPrivateKey','webAuthnContractId'] as const;
  for (const key of requiredTop) {
    if (!(config as any)[key]) throw new Error(`Missing required config variable: ${key}`);
  }

  // Shamir configuration is optional. If provided, validate required fields.
  const shamir = config.shamir;
  if (shamir) {
    if (!shamir.shamir_p_b64u) throw new Error('Missing required config variable: shamir.shamir_p_b64u');
    if (!shamir.shamir_e_s_b64u) throw new Error('Missing required config variable: shamir.shamir_e_s_b64u');
    if (!shamir.shamir_d_s_b64u) throw new Error('Missing required config variable: shamir.shamir_d_s_b64u');
  }

  // Validate private key format
  if (!config.relayerPrivateKey?.startsWith('ed25519:')) {
    throw new Error('Relayer private key must be in format "ed25519:base58privatekey"');
  }
}
