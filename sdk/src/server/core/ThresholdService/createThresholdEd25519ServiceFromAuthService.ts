import type { AuthService } from '../AuthService';
import type { ThresholdEd25519KeyStoreConfigInput } from '../types';
import type { Logger } from '../logger';
import { normalizeLogger } from '../logger';
import { ThresholdEd25519Service } from './ThresholdEd25519Service';
import { createThresholdEd25519KeyStore } from './ThresholdEd25519KeyStore';
import { createThresholdEd25519SessionStore } from './ThresholdEd25519SessionStore';

function isNodeEnvironment(): boolean {
  const processObj = (globalThis as unknown as { process?: { versions?: { node?: string } } }).process;
  const isNode = Boolean(processObj?.versions?.node);
  const webSocketPair = (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair;
  const isCloudflareWorker = typeof webSocketPair !== 'undefined'
    || (typeof navigator !== 'undefined' && String(navigator.userAgent || '').includes('Cloudflare-Workers'));
  return isNode && !isCloudflareWorker;
}

export function createThresholdEd25519ServiceFromAuthService(input: {
  authService: AuthService;
  thresholdEd25519KeyStore?: ThresholdEd25519KeyStoreConfigInput | null;
  logger?: Logger | null;
  isNode?: boolean;
}): ThresholdEd25519Service {
  const logger = normalizeLogger(input.logger);
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
    }
    : null;

  const config = input.thresholdEd25519KeyStore ?? envFallback;
  const keyStore = createThresholdEd25519KeyStore({ config, logger, isNode });
  const sessionStore = createThresholdEd25519SessionStore({ config, logger, isNode });

  const ensureReady = async (): Promise<void> => {
    await input.authService.getRelayerAccount();
  };

  return new ThresholdEd25519Service({
    logger,
    keyStore,
    sessionStore,
    ensureReady,
    ensureSignerWasm: ensureReady,
    verifyAuthenticationResponse: (req) => input.authService.verifyAuthenticationResponse(req),
    viewAccessKeyList: (accountId) => input.authService.viewAccessKeyList(accountId),
  });
}
