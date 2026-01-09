import { test, expect } from '@playwright/test';
import { createThresholdEd25519ServiceForUnitTests } from '../helpers/thresholdEd25519TestUtils';

test('threshold-ed25519 coordinator fanout: multiple peers are rejected (until multiparty implemented)', async () => {
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

  const init = await svc.thresholdEd25519SignInit({
    mpcSessionId,
    relayerKeyId,
    nearAccountId: userId,
    signingDigestB64u,
    clientCommitments: { hiding: 'h', binding: 'b' },
  });

  expect(init.ok).toBe(false);
  expect(init.code).toBe('multi_party_not_supported');
  expect(String(init.message || '')).toContain('coordinatorPeers contains multiple participant ids');
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
