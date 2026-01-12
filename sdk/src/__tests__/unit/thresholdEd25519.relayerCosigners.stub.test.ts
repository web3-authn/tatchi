import { test, expect } from '@playwright/test';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  createThresholdSigningServiceForUnitTests,
  verifyThresholdEd25519CoordinatorGrantHmac,
} from '../helpers/thresholdEd25519TestUtils';

const ED25519_ORDER_L = (1n << 252n) + 27742317777372353535851937790883648493n;

function modL(x: bigint): bigint {
  const r = x % ED25519_ORDER_L;
  return r >= 0n ? r : r + ED25519_ORDER_L;
}

function bytesToBigintLE(bytes: Uint8Array): bigint {
  let out = 0n;
  for (let i = 0; i < bytes.length; i += 1) {
    out |= BigInt(bytes[i]!) << (8n * BigInt(i));
  }
  return out;
}

function bigintToBytesLE32(x: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = modL(x);
  for (let i = 0; i < 32; i += 1) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function sumScalarsB64u(aB64u: string, bB64u: string): string {
  const a = bytesToBigintLE(Buffer.from(aB64u, 'base64url'));
  const b = bytesToBigintLE(Buffer.from(bB64u, 'base64url'));
  const sum = modL(a + b);
  return Buffer.from(bigintToBytesLE32(sum)).toString('base64url');
}

function pointB64u(s: bigint): string {
  const p = ed25519.Point.BASE.multiply(s);
  return Buffer.from(p.toBytes()).toString('base64url');
}

function sumPointsB64u(aB64u: string, bB64u: string): string {
  const a = ed25519.Point.fromBytes(Buffer.from(aB64u, 'base64url'));
  const b = ed25519.Point.fromBytes(Buffer.from(bB64u, 'base64url'));
  return Buffer.from(a.add(b).toBytes()).toString('base64url');
}

test('threshold-ed25519 relayer-fleet cosigning (2-of-3 stub) aggregates cosigner outputs', async () => {
  const secretB64u = Buffer.alloc(32, 7).toString('base64url');
  const cosigner1Url = 'https://cosigner-a.example';
  const cosigner2Url = 'https://cosigner-b.example';
  const cosigner3Url = 'https://cosigner-c.example';

  const groupPublicKey = 'ed25519:test-key';
  const relayerSigningShareB64u = Buffer.alloc(32, 11).toString('base64url');
  const relayerVerifyingShareB64u = Buffer.alloc(32, 12).toString('base64url');

  const { svc, sessionStore } = createThresholdSigningServiceForUnitTests({
    config: {
      THRESHOLD_NODE_ROLE: 'coordinator',
      THRESHOLD_ED25519_SHARE_MODE: 'kv',
      THRESHOLD_COORDINATOR_SHARED_SECRET_B64U: secretB64u,
      THRESHOLD_ED25519_RELAYER_COSIGNERS: JSON.stringify([
        { cosignerId: 1, relayerUrl: cosigner1Url },
        { cosignerId: 2, relayerUrl: cosigner2Url },
        { cosignerId: 3, relayerUrl: cosigner3Url },
      ]),
      THRESHOLD_ED25519_RELAYER_COSIGNER_T: '2',
    },
    keyRecord: {
      publicKey: groupPublicKey,
      relayerSigningShareB64u,
      relayerVerifyingShareB64u,
    },
    accessKeysOnChain: [groupPublicKey],
  });

  const mpcSessionId = 'mpc-test-cosign-1';
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

  const c2 = { hiding: pointB64u(10n), binding: pointB64u(11n) };
  const c3 = { hiding: pointB64u(20n), binding: pointB64u(21n) };
  const combined = {
    hiding: sumPointsB64u(c2.hiding, c3.hiding),
    binding: sumPointsB64u(c2.binding, c3.binding),
  };

  const sig2 = Buffer.alloc(32, 1).toString('base64url');
  const sig3 = Buffer.alloc(32, 2).toString('base64url');
  const combinedSig = sumScalarsB64u(sig2, sig3);

  const originalFetch = globalThis.fetch;
  const seenUrls: string[] = [];
  let coordinatorSigningSessionId = '';

  try {
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : String(input?.url || input);
      seenUrls.push(url);
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (url === `${cosigner1Url}/threshold-ed25519/internal/cosign/init`) {
        coordinatorSigningSessionId = String(body.signingSessionId || coordinatorSigningSessionId);
        const grant = await verifyThresholdEd25519CoordinatorGrantHmac(String(body.coordinatorGrant || ''), secretB64u);
        expect(grant.typ).toBe('threshold_ed25519_cosigner_grant_v1');
        expect(grant.cosignerId).toBe(1);
        return new Response(JSON.stringify({ ok: false, code: 'unavailable', message: 'down' }), { status: 503 });
      }

      if (url === `${cosigner2Url}/threshold-ed25519/internal/cosign/init`) {
        coordinatorSigningSessionId = String(body.signingSessionId || coordinatorSigningSessionId);
        const grant = await verifyThresholdEd25519CoordinatorGrantHmac(String(body.coordinatorGrant || ''), secretB64u);
        expect(grant.typ).toBe('threshold_ed25519_cosigner_grant_v1');
        expect(grant.cosignerId).toBe(2);
        expect(grant.mpcSessionId).toBe(mpcSessionId);
        expect(grant.mpcSession?.userId).toBe(userId);
        expect(Buffer.from(String(body.cosignerShareB64u || ''), 'base64url')).toHaveLength(32);
        return new Response(JSON.stringify({ ok: true, relayerCommitments: c2 }), { status: 200 });
      }

      if (url === `${cosigner3Url}/threshold-ed25519/internal/cosign/init`) {
        coordinatorSigningSessionId = String(body.signingSessionId || coordinatorSigningSessionId);
        const grant = await verifyThresholdEd25519CoordinatorGrantHmac(String(body.coordinatorGrant || ''), secretB64u);
        expect(grant.typ).toBe('threshold_ed25519_cosigner_grant_v1');
        expect(grant.cosignerId).toBe(3);
        expect(grant.mpcSessionId).toBe(mpcSessionId);
        expect(grant.mpcSession?.userId).toBe(userId);
        expect(Buffer.from(String(body.cosignerShareB64u || ''), 'base64url')).toHaveLength(32);
        return new Response(JSON.stringify({ ok: true, relayerCommitments: c3 }), { status: 200 });
      }

      if (url === `${cosigner2Url}/threshold-ed25519/internal/cosign/finalize`) {
        const grant = await verifyThresholdEd25519CoordinatorGrantHmac(String(body.coordinatorGrant || ''), secretB64u);
        expect(grant.typ).toBe('threshold_ed25519_cosigner_grant_v1');
        expect(grant.cosignerId).toBe(2);
        expect(body.signingSessionId).toBe(coordinatorSigningSessionId);
        expect(body.cosignerIds).toEqual([2, 3]);
        expect(body.groupPublicKey).toBe(groupPublicKey);
        expect(body.relayerCommitments).toEqual(combined);
        return new Response(JSON.stringify({ ok: true, relayerSignatureShareB64u: sig2 }), { status: 200 });
      }

      if (url === `${cosigner3Url}/threshold-ed25519/internal/cosign/finalize`) {
        const grant = await verifyThresholdEd25519CoordinatorGrantHmac(String(body.coordinatorGrant || ''), secretB64u);
        expect(grant.typ).toBe('threshold_ed25519_cosigner_grant_v1');
        expect(grant.cosignerId).toBe(3);
        expect(body.signingSessionId).toBe(coordinatorSigningSessionId);
        expect(body.cosignerIds).toEqual([2, 3]);
        expect(body.groupPublicKey).toBe(groupPublicKey);
        expect(body.relayerCommitments).toEqual(combined);
        return new Response(JSON.stringify({ ok: true, relayerSignatureShareB64u: sig3 }), { status: 200 });
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
    expect(init.commitmentsById?.['2']).toEqual(combined);
    expect(init.relayerVerifyingSharesById?.['2']).toBe(relayerVerifyingShareB64u);

    const signingSessionId = String(init.signingSessionId);
    expect(signingSessionId).toBeTruthy();
    expect(coordinatorSigningSessionId).toBe(signingSessionId);

    const finalize = await svc.thresholdEd25519SignFinalize({
      signingSessionId,
      clientSignatureShareB64u: 'client-ss',
    });
    expect(finalize.ok).toBe(true);
    expect(finalize.relayerSignatureSharesById?.['2']).toBe(combinedSig);

    expect(seenUrls).toEqual(expect.arrayContaining([
      `${cosigner1Url}/threshold-ed25519/internal/cosign/init`,
      `${cosigner2Url}/threshold-ed25519/internal/cosign/init`,
      `${cosigner3Url}/threshold-ed25519/internal/cosign/init`,
      `${cosigner2Url}/threshold-ed25519/internal/cosign/finalize`,
      `${cosigner3Url}/threshold-ed25519/internal/cosign/finalize`,
    ]));
    expect(seenUrls).not.toContain(`${cosigner1Url}/threshold-ed25519/internal/cosign/finalize`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
