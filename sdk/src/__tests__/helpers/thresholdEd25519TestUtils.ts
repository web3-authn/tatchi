import { ThresholdEd25519Service } from '../../server/core/ThresholdService/ThresholdEd25519Service';
import { createThresholdEd25519SessionStore } from '../../server/core/ThresholdService/stores/SessionStore';
import type { ThresholdEd25519KeyStoreConfigInput } from '../../server/core/types';

export function silentLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

export function createThresholdEd25519ServiceForUnitTests(input: {
  config?: ThresholdEd25519KeyStoreConfigInput | null;
}): { svc: ThresholdEd25519Service; sessionStore: ReturnType<typeof createThresholdEd25519SessionStore> } {
  const logger = silentLogger();
  const sessionStore = createThresholdEd25519SessionStore({
    config: { kind: 'in-memory' },
    logger,
    isNode: true,
  });

  const svc = new ThresholdEd25519Service({
    logger,
    keyStore: { get: async () => null, put: async () => {}, del: async () => {} },
    sessionStore,
    authSessionStore: {
      putSession: async () => {},
      getSession: async () => null,
      consumeUse: async () => ({ ok: false, code: 'unauthorized', message: 'unused' }),
    },
    config: input.config,
    ensureReady: async () => {},
    ensureSignerWasm: async () => {},
    verifyAuthenticationResponse: async () => ({ success: false }),
    viewAccessKeyList: async () => ({ keys: [] } as any),
    txStatus: async () => ({} as any),
    webAuthnContractId: 'test',
  });

  return { svc, sessionStore };
}

export async function verifyThresholdEd25519CoordinatorGrantHmac(token: string, secretB64u: string): Promise<any> {
  const [payloadB64u, sigB64u] = token.split('.');
  if (!payloadB64u || !sigB64u) throw new Error('Invalid coordinatorGrant format');

  const payloadBytes = Buffer.from(payloadB64u, 'base64url');
  const sigBytes = Buffer.from(sigB64u, 'base64url');
  if (sigBytes.length !== 32) throw new Error('Invalid coordinatorGrant signature length');

  const secretBytes = Buffer.from(secretB64u, 'base64url');
  if (secretBytes.length !== 32) throw new Error('Invalid coordinatorGrant shared secret length');

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = Buffer.from(await crypto.subtle.sign('HMAC', key, payloadBytes));
  if (Buffer.compare(expected, sigBytes) !== 0) throw new Error('Invalid coordinatorGrant signature');

  return JSON.parse(payloadBytes.toString('utf8'));
}
