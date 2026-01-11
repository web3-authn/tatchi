import { test, expect } from '@playwright/test';
import { createThresholdEd25519ServiceForUnitTests } from '../helpers/thresholdEd25519TestUtils';

test('threshold-ed25519 coordinator fanout: multiple peers configured (selects a peer)', async () => {
  const secretB64u = Buffer.alloc(32, 7).toString('base64url');
  const { svc, sessionStore } = createThresholdEd25519ServiceForUnitTests({
    config: {
      THRESHOLD_NODE_ROLE: 'coordinator',
      THRESHOLD_COORDINATOR_PEERS: JSON.stringify([
        { id: 2, relayerUrl: 'https://peer-a.example' },
        { id: 3, relayerUrl: 'https://peer-b.example' },
      ]),
      THRESHOLD_COORDINATOR_SHARED_SECRET_B64U: secretB64u,
    },
  });

  const mpcSessionId = 'mpc-test-multi-peer';
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

  const seen: Array<{ url: string; body: any }> = [];
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: any, init?: any) => {
    const body = (() => {
      try {
        return init?.body ? JSON.parse(String(init.body)) : null;
      } catch {
        return null;
      }
    })();
    seen.push({ url: String(url), body });
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          signingSessionId: 'peer-sign-1',
          relayerCommitments: { hiding: 'rh', binding: 'rb' },
          relayerVerifyingShareB64u: Buffer.alloc(32, 3).toString('base64url'),
        });
      },
    } as any;
  };

  let init: any;
  try {
    init = await svc.thresholdEd25519SignInit({
      mpcSessionId,
      relayerKeyId,
      nearAccountId: userId,
      signingDigestB64u,
      clientCommitments: { hiding: 'h', binding: 'b' },
    });
  } finally {
    (globalThis as any).fetch = originalFetch;
  }

  expect(init.ok).toBe(true);
  expect(seen[0]?.url).toBe('https://peer-a.example/threshold-ed25519/internal/sign/init');
  expect(seen[0]?.body?.clientCommitments).toEqual({ hiding: 'h', binding: 'b' });
  expect(String(seen[0]?.body?.coordinatorGrant || '')).toContain('.');

  expect(init.participantIds).toEqual([1, 2]);
  expect(init.commitmentsById?.['1']).toEqual({ hiding: 'h', binding: 'b' });
  expect(init.commitmentsById?.['2']).toEqual({ hiding: 'rh', binding: 'rb' });
  expect(init.relayerVerifyingSharesById?.['2']).toBeTruthy();
});

test.describe.skip('threshold-ed25519 multiparty (2-of-3) [future]', () => {
  test('coordinator fanout to 2 relayer participants + aggregate (stub)', async () => {
    // Intended shape (future):
    // - participantIds: [1, 2, 3]
    // - coordinatorPeers: [{id:2,url:a},{id:3,url:b}]
    // - coordinator calls both peers for /internal/sign/init and /internal/sign/finalize
    // - coordinator returns commitmentsById and relayerSignatureSharesById maps (keys "2" and "3")
    // - signer worker selects a signer set (2-of-3) and aggregates locally
    expect(true).toBe(true);
  });

  test('warm session auth binds signer set (stub)', async () => {
    // Intended: threshold session JWT/cookie binds participantIds (signer set),
    // coordinator mints it once and subsequent /authorize uses session token
    // without additional WebAuthn prompts.
    expect(true).toBe(true);
  });
});
