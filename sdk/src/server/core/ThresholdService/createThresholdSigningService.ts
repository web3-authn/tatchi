import type { AuthService } from '../AuthService';
import type { ThresholdEd25519KeyStoreConfigInput } from '../types';
import type { Logger } from '../logger';
import { coerceLogger } from '../logger';
import { ThresholdSigningService } from './ThresholdSigningService';
import { createThresholdEd25519AuthSessionStore } from './stores/AuthSessionStore';
import { createThresholdEd25519KeyStore } from './stores/KeyStore';
import { createThresholdEd25519SessionStore } from './stores/SessionStore';
import { isObject } from '../../../utils/validation';

function isNodeEnvironment(): boolean {
  const processObj = (globalThis as unknown as { process?: { versions?: { node?: string } } }).process;
  const isNode = Boolean(processObj?.versions?.node);
  const webSocketPair = (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair;
  const isCloudflareWorker = typeof webSocketPair !== 'undefined'
    || (typeof navigator !== 'undefined' && String(navigator.userAgent || '').includes('Cloudflare-Workers'));
  return isNode && !isCloudflareWorker;
}

export function createThresholdSigningService(input: {
  authService: AuthService;
  thresholdEd25519KeyStore?: ThresholdEd25519KeyStoreConfigInput | null;
  logger?: Logger | null;
  isNode?: boolean;
}): ThresholdSigningService {
  const logger = coerceLogger(input.logger);
  const isNode = input.isNode ?? isNodeEnvironment();
  const env = isNode
    ? (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
    : undefined;
  const envFallback: ThresholdEd25519KeyStoreConfigInput | null = env
    ? {
      UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
      REDIS_URL: env.REDIS_URL,
      THRESHOLD_ED25519_KEYSTORE_PREFIX: env.THRESHOLD_ED25519_KEYSTORE_PREFIX,
      THRESHOLD_ED25519_SESSION_PREFIX: env.THRESHOLD_ED25519_SESSION_PREFIX,
      THRESHOLD_ED25519_AUTH_PREFIX: env.THRESHOLD_ED25519_AUTH_PREFIX,
      THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID: env.THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID,
      THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID: env.THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID,
      THRESHOLD_ED25519_MASTER_SECRET_B64U: env.THRESHOLD_ED25519_MASTER_SECRET_B64U,
      THRESHOLD_ED25519_SHARE_MODE: env.THRESHOLD_ED25519_SHARE_MODE,
      THRESHOLD_NODE_ROLE: env.THRESHOLD_NODE_ROLE,
      THRESHOLD_COORDINATOR_SHARED_SECRET_B64U: env.THRESHOLD_COORDINATOR_SHARED_SECRET_B64U,
      THRESHOLD_ED25519_RELAYER_COSIGNERS: env.THRESHOLD_ED25519_RELAYER_COSIGNERS,
      THRESHOLD_ED25519_RELAYER_COSIGNER_ID: env.THRESHOLD_ED25519_RELAYER_COSIGNER_ID,
      THRESHOLD_ED25519_RELAYER_COSIGNER_T: env.THRESHOLD_ED25519_RELAYER_COSIGNER_T,
    }
    : null;

  // Merge explicit config over env-derived defaults so callers can set
  // `kind: 'in-memory'` (etc) while still using env vars like THRESHOLD_NODE_ROLE.
  const config = (isObject(envFallback) && isObject(input.thresholdEd25519KeyStore))
    ? ({ ...envFallback, ...input.thresholdEd25519KeyStore } as ThresholdEd25519KeyStoreConfigInput)
    : (input.thresholdEd25519KeyStore ?? envFallback);

  // Emit a single, non-sensitive config summary to help hosts confirm that threshold signing is wired up.
  try {
    const cosignersRaw = (config as { THRESHOLD_ED25519_RELAYER_COSIGNERS?: unknown })?.THRESHOLD_ED25519_RELAYER_COSIGNERS;
    const cosignerCount = (() => {
      if (typeof cosignersRaw !== 'string') return null;
      const parsed = JSON.parse(cosignersRaw);
      return Array.isArray(parsed) ? parsed.length : null;
    })();
    const shareMode = (config as { THRESHOLD_ED25519_SHARE_MODE?: unknown })?.THRESHOLD_ED25519_SHARE_MODE;
    const nodeRole = (config as { THRESHOLD_NODE_ROLE?: unknown })?.THRESHOLD_NODE_ROLE;
    const cosignerId = (config as { THRESHOLD_ED25519_RELAYER_COSIGNER_ID?: unknown })?.THRESHOLD_ED25519_RELAYER_COSIGNER_ID;
    const cosignerT = (config as { THRESHOLD_ED25519_RELAYER_COSIGNER_T?: unknown })?.THRESHOLD_ED25519_RELAYER_COSIGNER_T;
    const hasMasterSecret = Boolean(
      typeof (config as { THRESHOLD_ED25519_MASTER_SECRET_B64U?: unknown })?.THRESHOLD_ED25519_MASTER_SECRET_B64U === 'string'
      && (config as { THRESHOLD_ED25519_MASTER_SECRET_B64U?: string })?.THRESHOLD_ED25519_MASTER_SECRET_B64U?.trim(),
    );

    logger.info('[threshold-ed25519] init', {
      isNode,
      nodeRole: typeof nodeRole === 'string' ? nodeRole : null,
      shareMode: typeof shareMode === 'string' ? shareMode : null,
      hasMasterSecret,
      cosignerId: typeof cosignerId === 'string' ? cosignerId : null,
      cosignerT: typeof cosignerT === 'string' ? cosignerT : null,
      cosignerCount,
    });
  } catch {
    // Ignore logging issues; never block service creation.
  }

  const keyStore = createThresholdEd25519KeyStore({ config, logger, isNode });
  const sessionStore = createThresholdEd25519SessionStore({ config, logger, isNode });
  const authSessionStore = createThresholdEd25519AuthSessionStore({ config, logger, isNode });

  const ensureReady = async (): Promise<void> => {
    await input.authService.getRelayerAccount();
  };

  return new ThresholdSigningService({
    logger,
    keyStore,
    sessionStore,
    authSessionStore,
    config,
    ensureReady,
    ensureSignerWasm: ensureReady,
    verifyAuthenticationResponse: (req) => input.authService.verifyAuthenticationResponse(req),
    viewAccessKeyList: (accountId) => input.authService.viewAccessKeyList(accountId),
    txStatus: (txHash, senderAccountId) => input.authService.txStatus(txHash, senderAccountId),
    webAuthnContractId: input.authService.getWebAuthnContractId(),
  });
}
