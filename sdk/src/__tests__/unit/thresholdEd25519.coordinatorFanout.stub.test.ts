import { test, expect } from '@playwright/test';
import { ThresholdEd25519Service } from '../../server/core/ThresholdService/ThresholdEd25519Service';
import { createThresholdEd25519SessionStore } from '../../server/core/ThresholdService/ThresholdEd25519SessionStore';

function silentLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

async function verifyCoordinatorGrantHmac(token: string, secretB64u: string): Promise<any> {
  const [payloadB64u, sigB64u] = token.split('.');
  expect(payloadB64u).toBeTruthy();
  expect(sigB64u).toBeTruthy();

  const payloadBytes = Buffer.from(payloadB64u, 'base64url');
  const sigBytes = Buffer.from(sigB64u, 'base64url');
  expect(sigBytes.length).toBe(32);

  const secretBytes = Buffer.from(secretB64u, 'base64url');
  expect(secretBytes.length).toBe(32);

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = Buffer.from(await crypto.subtle.sign('HMAC', key, payloadBytes));
  expect(Buffer.compare(expected, sigBytes)).toBe(0);

  return JSON.parse(payloadBytes.toString('utf8'));
}

test('threshold-ed25519 coordinator fanout (2P stub) uses coordinatorGrant + stores transcript', async () => {
  const logger = silentLogger();
  const secretB64u = Buffer.alloc(32, 7).toString('base64url');
  const peerUrl = 'https://peer.example';

  const sessionStore = createThresholdEd25519SessionStore({
    config: { kind: 'in-memory' },
    logger,
    isNode: true,
  });

  const svc = new ThresholdEd25519Service({
    logger,
    keyStore: { get: async () => null, put: async () => {}, del: async () => {} },
    sessionStore,
    authSessionStore: { putSession: async () => {}, getSession: async () => null, consumeUse: async () => ({ ok: false, code: 'unauthorized', message: 'unused' }) },
    config: {
      THRESHOLD_NODE_ROLE: 'coordinator',
      THRESHOLD_COORDINATOR_PEERS: JSON.stringify([{ id: 2, relayerUrl: peerUrl }]),
      THRESHOLD_COORDINATOR_SHARED_SECRET_B64U: secretB64u,
    },
    ensureReady: async () => {},
    ensureSignerWasm: async () => {},
    verifyAuthenticationResponse: async () => ({ success: false }),
    viewAccessKeyList: async () => ({ keys: [] } as any),
    txStatus: async () => ({} as any),
    webAuthnContractId: 'test',
  });

  const mpcSessionId = 'mpc-test-1';
  const signingDigestB64u = Buffer.alloc(32, 9).toString('base64url');
  const clientVerifyingShareB64u = Buffer.alloc(32, 5).toString('base64url');
  const relayerKeyId = 'ed25519:dummy';
  const userId = 'alice.near';
  const rpId = 'example.com';

  await sessionStore.putMpcSession(mpcSessionId, {
    expiresAtMs: Date.now() + 60_000,
    relayerKeyId,
    purpose: 'near_tx',
    intentDigestB64u: Buffer.alloc(32, 1).toString('base64url'),
    signingDigestB64u,
    userId,
    rpId,
    clientVerifyingShareB64u,
    participantIds: [1, 2],
  }, 60_000);

  const originalFetch = globalThis.fetch;
  const seenUrls: string[] = [];
  try {
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : String(input?.url || input);
      seenUrls.push(url);
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (url === `${peerUrl}/threshold-ed25519/internal/sign/init`) {
        expect(body.clientCommitments?.hiding).toBe('h');
        expect(body.clientCommitments?.binding).toBe('b');
        const grant = await verifyCoordinatorGrantHmac(String(body.coordinatorGrant || ''), secretB64u);
        expect(grant.typ).toBe('threshold_ed25519_coordinator_grant_v1');
        expect(grant.peerParticipantId).toBe(2);
        expect(grant.mpcSessionId).toBe(mpcSessionId);
        expect(grant.mpcSession?.userId).toBe(userId);
        expect(grant.mpcSession?.relayerKeyId).toBe(relayerKeyId);
        expect(grant.mpcSession?.signingDigestB64u).toBe(signingDigestB64u);
        return new Response(JSON.stringify({
          ok: true,
          signingSessionId: 'peer-sign-session-1',
          relayerCommitments: { hiding: 'rh', binding: 'rb' },
          relayerVerifyingShareB64u: 'relayer-vs',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === `${peerUrl}/threshold-ed25519/internal/sign/finalize`) {
        const grant = await verifyCoordinatorGrantHmac(String(body.coordinatorGrant || ''), secretB64u);
        expect(grant.typ).toBe('threshold_ed25519_coordinator_grant_v1');
        expect(grant.peerParticipantId).toBe(2);
        expect(grant.mpcSessionId).toBe(mpcSessionId);
        expect(grant.mpcSession?.userId).toBe(userId);
        expect(grant.mpcSession?.relayerKeyId).toBe(relayerKeyId);
        expect(grant.mpcSession?.signingDigestB64u).toBe(signingDigestB64u);
        expect(body.signingSessionId).toBe('peer-sign-session-1');
        expect(body.clientSignatureShareB64u).toBe('client-ss');
        return new Response(JSON.stringify({
          ok: true,
          relayerSignatureShareB64u: 'relayer-ss',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ ok: false, code: 'not_found', message: 'unexpected url' }), { status: 404 });
    }) as any;

    const init = await svc.thresholdEd25519SignInit({
      mpcSessionId,
      relayerKeyId,
      nearAccountId: userId,
      signingDigestB64u,
      clientCommitments: { hiding: 'h', binding: 'b' },
    });
    expect(init.ok).toBe(true);
    expect(init.participantIds).toEqual([1, 2]);
    expect(init.commitmentsById?.['1']).toEqual({ hiding: 'h', binding: 'b' });
    expect(init.commitmentsById?.['2']).toEqual({ hiding: 'rh', binding: 'rb' });
    expect(init.relayerVerifyingSharesById?.['2']).toBe('relayer-vs');
    expect(init.signingSessionId).toBeTruthy();

    const finalize = await svc.thresholdEd25519SignFinalize({
      signingSessionId: String(init.signingSessionId),
      clientSignatureShareB64u: 'client-ss',
    });
    expect(finalize.ok).toBe(true);
    expect(finalize.relayerSignatureSharesById?.['2']).toBe('relayer-ss');

    expect(seenUrls).toEqual([
      `${peerUrl}/threshold-ed25519/internal/sign/init`,
      `${peerUrl}/threshold-ed25519/internal/sign/finalize`,
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
