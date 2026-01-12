import type {
  AuthServiceConfig,
  AuthServiceConfigInput,
  ShamirConfig,
  ShamirConfigEnvInput,
  ZkEmailProverConfigEnvInput,
} from './types';
import { toOptionalTrimmedString } from '../../utils/validation';

export const AUTH_SERVICE_CONFIG_DEFAULTS = {
  // Prefer FastNEAR for testnet by default (more reliable in practice).
  // If you set `networkId: 'mainnet'` and omit `nearRpcUrl`, the default switches to NEAR mainnet RPC.
  nearRpcUrlTestnet: 'https://test.rpc.fastnear.com',
  nearRpcUrlMainnet: 'https://rpc.mainnet.near.org',
  networkId: 'testnet',
  // 0.03 NEAR (typical for examples; adjust based on your app/storage needs).
  accountInitialBalance: '30000000000000000000000',
  // 85 TGas (tested)
  createAccountAndRegisterGas: '85000000000000',
} as const;

function defaultNearRpcUrl(networkId: string): string {
  const net = String(networkId || '').trim().toLowerCase();
  if (net === 'mainnet') return AUTH_SERVICE_CONFIG_DEFAULTS.nearRpcUrlMainnet;
  return AUTH_SERVICE_CONFIG_DEFAULTS.nearRpcUrlTestnet;
}

function normalizeZkEmailProverConfig(
  input: AuthServiceConfigInput['zkEmailProver'],
): AuthServiceConfig['zkEmailProver'] | undefined {
  if (!input) return undefined;

  // Full options object
  if (typeof (input as any).baseUrl === 'string') {
    const baseUrl = toOptionalTrimmedString((input as any).baseUrl);
    if (!baseUrl) return undefined;
    return input as AuthServiceConfig['zkEmailProver'];
  }

  // Env-shaped input
  const envInput = input as ZkEmailProverConfigEnvInput;
  const baseUrl = toOptionalTrimmedString(envInput.ZK_EMAIL_PROVER_BASE_URL);
  const timeoutMsRaw = toOptionalTrimmedString(envInput.ZK_EMAIL_PROVER_TIMEOUT_MS);

  const anyProvided = Boolean(baseUrl || timeoutMsRaw);
  if (!anyProvided) return undefined;
  if (!baseUrl) {
    throw new Error('zkEmailProver enabled but ZK_EMAIL_PROVER_BASE_URL is not set');
  }

  const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : undefined;
  if (timeoutMsRaw && (!Number.isFinite(timeoutMs) || timeoutMs! <= 0)) {
    throw new Error('ZK_EMAIL_PROVER_TIMEOUT_MS must be a positive integer (ms)');
  }

  return {
    baseUrl,
    timeoutMs,
  };
}

function normalizeShamirConfig(input: AuthServiceConfigInput['shamir']): AuthServiceConfig['shamir'] | undefined {
  if (!input) return undefined;

  // Already normalized config shape
  if (typeof (input as any).shamir_p_b64u === 'string') {
    const c = input as ShamirConfig;
    // Treat all-empty as disabled for safety
    const anyProvided = Boolean(
      toOptionalTrimmedString(c.shamir_p_b64u) ||
      toOptionalTrimmedString(c.shamir_e_s_b64u) ||
      toOptionalTrimmedString(c.shamir_d_s_b64u),
    );
    if (!anyProvided) return undefined;
    return c;
  }

  // Env-shaped input
  const envInput = input as ShamirConfigEnvInput;
  const p = toOptionalTrimmedString(envInput.SHAMIR_P_B64U);
  const e = toOptionalTrimmedString(envInput.SHAMIR_E_S_B64U);
  const d = toOptionalTrimmedString(envInput.SHAMIR_D_S_B64U);
  const graceFileEnv = toOptionalTrimmedString(envInput.SHAMIR_GRACE_KEYS_FILE);

  const anyProvided = Boolean(p || e || d || graceFileEnv);
  if (!anyProvided) return undefined;

  if (!p || !e || !d) {
    throw new Error('Shamir enabled but SHAMIR_P_B64U / SHAMIR_E_S_B64U / SHAMIR_D_S_B64U are not all set');
  }

  const graceShamirKeysFile =
    // Preserve explicit empty-string overrides (workers use this to disable FS).
    envInput.graceShamirKeysFile !== undefined
      ? envInput.graceShamirKeysFile
      : (graceFileEnv || undefined);

  return {
    shamir_p_b64u: p,
    shamir_e_s_b64u: e,
    shamir_d_s_b64u: d,
    graceShamirKeys: envInput.graceShamirKeys,
    graceShamirKeysFile,
    moduleOrPath: envInput.moduleOrPath,
  };
}

function normalizeThresholdEd25519KeyStoreConfig(
  input: AuthServiceConfigInput['thresholdEd25519KeyStore'],
): AuthServiceConfig['thresholdEd25519KeyStore'] | undefined {
  if (!input) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) return undefined;

  const c = input as Record<string, unknown>;
  const anyProvided = Boolean(
    // Minimal (env-shaped)
    toOptionalTrimmedString(c.THRESHOLD_ED25519_SHARE_MODE)
    || toOptionalTrimmedString(c.THRESHOLD_ED25519_MASTER_SECRET_B64U)
    || toOptionalTrimmedString(c.THRESHOLD_NODE_ROLE)
    || toOptionalTrimmedString(c.THRESHOLD_COORDINATOR_SHARED_SECRET_B64U)
    || toOptionalTrimmedString(c.THRESHOLD_ED25519_RELAYER_COSIGNERS)
    || toOptionalTrimmedString(c.THRESHOLD_ED25519_RELAYER_COSIGNER_ID)
    || toOptionalTrimmedString(c.THRESHOLD_ED25519_RELAYER_COSIGNER_T)
    || toOptionalTrimmedString(c.THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID)
    || toOptionalTrimmedString(c.THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID)
    || toOptionalTrimmedString(c.THRESHOLD_ED25519_AUTH_PREFIX)
    || toOptionalTrimmedString(c.THRESHOLD_ED25519_SESSION_PREFIX)
    || toOptionalTrimmedString(c.THRESHOLD_ED25519_KEYSTORE_PREFIX)
    // Explicit store config (kind-shaped)
    || toOptionalTrimmedString(c.kind)
    || toOptionalTrimmedString(c.url)
    || toOptionalTrimmedString(c.token)
    || toOptionalTrimmedString(c.redisUrl)
    // Env-shaped store toggles
    || toOptionalTrimmedString(c.UPSTASH_REDIS_REST_URL)
    || toOptionalTrimmedString(c.UPSTASH_REDIS_REST_TOKEN)
    || toOptionalTrimmedString(c.REDIS_URL),
  );
  if (!anyProvided) return undefined;
  return input;
}

export function createAuthServiceConfig(input: AuthServiceConfigInput): AuthServiceConfig {
  const networkId = String(input.networkId || '').trim() || AUTH_SERVICE_CONFIG_DEFAULTS.networkId;
  const config: AuthServiceConfig = {
    relayerAccountId: input.relayerAccountId,
    relayerPrivateKey: input.relayerPrivateKey,
    webAuthnContractId: input.webAuthnContractId,
    nearRpcUrl: String(input.nearRpcUrl || '').trim() || defaultNearRpcUrl(networkId),
    networkId: networkId,
    accountInitialBalance: String(input.accountInitialBalance || '').trim()
      || AUTH_SERVICE_CONFIG_DEFAULTS.accountInitialBalance,
    createAccountAndRegisterGas: String(input.createAccountAndRegisterGas || '').trim()
      || AUTH_SERVICE_CONFIG_DEFAULTS.createAccountAndRegisterGas,
    shamir: normalizeShamirConfig(input.shamir),
    signerWasm: input.signerWasm,
    thresholdEd25519KeyStore: normalizeThresholdEd25519KeyStoreConfig(input.thresholdEd25519KeyStore),
    logger: input.logger,
    zkEmailProver: normalizeZkEmailProverConfig(input.zkEmailProver),
  };

  validateConfigs(config);
  return config;
}

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

export function parseBool(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function requireEnvVar<T extends object, K extends keyof T & string>(env: T, name: K): string {
  const raw = (env as any)?.[name] as unknown;
  if (typeof raw !== 'string') throw new Error(`Missing required env var: ${name}`);
  const v = raw.trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
