import { test, expect } from '@playwright/test';
import * as ed from '@noble/ed25519';
import bs58 from 'bs58';
import { base64UrlEncode } from '../../utils/encoders';
import { alphabetizeStringify, sha256BytesUtf8 } from '../../utils/digests';
import { ActionType, type ActionArgsWasm } from '../../core/types/actions';
import { AuthService } from '../../server/core/AuthService';
import { createThresholdEd25519ServiceFromAuthService } from '../../server/core/ThresholdService';
import type { VerifyAuthenticationRequest, VerifyAuthenticationResponse } from '../../server/core/types';
import { createRelayRouter } from '../../server/router/express-adaptor';
import { createCloudflareRouter } from '../../server/router/cloudflare-adaptor';
import { threshold_ed25519_compute_near_tx_signing_digests } from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';
import { callCf, fetchJson, makeCfCtx, startExpressRouter } from './helpers';

function makeAuthServiceForThreshold(): { service: AuthService; threshold: ReturnType<typeof createThresholdEd25519ServiceFromAuthService> } {
  const svc = new AuthService({
    relayerAccountId: 'relayer.testnet',
    relayerPrivateKey: 'ed25519:dummy',
    webAuthnContractId: 'w3a-v1.testnet',
    nearRpcUrl: 'https://rpc.testnet.near.org',
    networkId: 'testnet',
    accountInitialBalance: '1',
    createAccountAndRegisterGas: '1',
    logger: null,
  });

  // Avoid network calls in /authorize tests; scope logic lives in AuthService.
  (svc as unknown as { verifyAuthenticationResponse: (req: VerifyAuthenticationRequest) => Promise<VerifyAuthenticationResponse> })
    .verifyAuthenticationResponse = async (_req: VerifyAuthenticationRequest) => ({ success: true, verified: true });

  // Avoid network calls for access key list checks. Tests set `__testAllowedNearPublicKey`
  // after /keygen returns the public key.
  (svc as unknown as { __testAllowedNearPublicKey?: string }).__testAllowedNearPublicKey = '';
  (svc as unknown as { nearClient: { viewAccessKeyList: (accountId: string) => Promise<unknown> } }).nearClient.viewAccessKeyList =
    async (_accountId: string) => {
      const key = String((svc as unknown as { __testAllowedNearPublicKey?: string }).__testAllowedNearPublicKey || '').trim();
      if (!key) return { keys: [] };
      return { keys: [{ public_key: key, access_key: { nonce: 0, permission: 'FullAccess' } }] };
    };

  const threshold = createThresholdEd25519ServiceFromAuthService({
    authService: svc,
    thresholdEd25519KeyStore: { kind: 'in-memory' },
    logger: null,
  });

  return { service: svc, threshold };
}

async function randomClientVerifyingShareB64u(): Promise<string> {
  const sk = crypto.getRandomValues(new Uint8Array(32));
  const pk = await ed.getPublicKeyAsync(sk);
  return base64UrlEncode(pk);
}

function randomBytes32(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function buildNearTxAuthorizeBody(input: {
  relayerKeyId: string;
  nearAccountId: string;
  nearPublicKeyStr: string;
  receiverId: string;
  actions: ActionArgsWasm[];
}): Promise<{ body: Record<string, unknown>; signingDigestB64u: string }> {
  const txSigningRequests = [{
    nearAccountId: input.nearAccountId,
    receiverId: input.receiverId,
    actions: input.actions,
  }];
  const txBlockHashBytes = randomBytes32();
  const signingPayload = {
    kind: 'near_tx',
    txSigningRequests,
    transactionContext: {
      nearPublicKeyStr: input.nearPublicKeyStr,
      nextNonce: '1',
      txBlockHeight: '1',
      txBlockHash: bs58.encode(txBlockHashBytes),
    },
  };

  const digestsUnknown: unknown = threshold_ed25519_compute_near_tx_signing_digests(signingPayload);
  if (!Array.isArray(digestsUnknown) || !digestsUnknown.length) {
    throw new Error('Failed to compute near_tx signing digest via WASM');
  }
  const first = digestsUnknown[0];
  const signingDigestBytes = first instanceof Uint8Array ? first : null;
  if (!signingDigestBytes || signingDigestBytes.length !== 32) {
    throw new Error('Failed to compute near_tx signing digest via WASM');
  }

  const intentJson = alphabetizeStringify([{ receiverId: input.receiverId, actions: input.actions }]);
  const intentDigest32 = Array.from(await sha256BytesUtf8(intentJson));

  return {
    signingDigestB64u: base64UrlEncode(signingDigestBytes),
    body: {
      relayerKeyId: input.relayerKeyId,
      purpose: 'near_tx',
      signing_digest_32: Array.from(signingDigestBytes),
      signingPayload,
      vrf_data: {
        vrf_input_data: Array(32).fill(0),
        vrf_output: [1],
        vrf_proof: [2],
        public_key: [3],
        user_id: input.nearAccountId,
        rp_id: 'example.localhost',
        block_height: 123,
        block_hash: Array(32).fill(0),
        intent_digest_32: intentDigest32,
      },
      webauthn_authentication: { ok: true },
    },
  };
}

async function buildKeygenBody(input: {
  nearAccountId: string;
  clientVerifyingShareB64u: string;
  rpId?: string;
}): Promise<Record<string, unknown>> {
  const rpId = input.rpId ?? 'example.localhost';
  const intentJson = alphabetizeStringify({
    kind: 'threshold_ed25519_keygen',
    nearAccountId: input.nearAccountId,
    rpId,
    clientVerifyingShareB64u: input.clientVerifyingShareB64u,
  });
  const intentDigest32 = Array.from(await sha256BytesUtf8(intentJson));

  return {
    nearAccountId: input.nearAccountId,
    clientVerifyingShareB64u: input.clientVerifyingShareB64u,
    vrf_data: {
      vrf_input_data: Array(32).fill(0),
      vrf_output: [1],
      vrf_proof: [2],
      public_key: [3],
      user_id: input.nearAccountId,
      rp_id: rpId,
      block_height: 123,
      block_hash: Array(32).fill(0),
      intent_digest_32: intentDigest32,
    },
    webauthn_authentication: { ok: true },
  };
}

function minimalAuthorizeBody(input: {
  relayerKeyId: string;
  purpose: string;
  signingDigest32: number[];
  userId: string;
  intentDigest32: number[];
}): Record<string, unknown> {
  return {
    relayerKeyId: input.relayerKeyId,
    purpose: input.purpose,
    signing_digest_32: input.signingDigest32,
    signingPayload: { kind: input.purpose },
    vrf_data: {
      vrf_input_data: Array(32).fill(0),
      vrf_output: [1],
      vrf_proof: [2],
      public_key: [3],
      user_id: input.userId,
      rp_id: 'example.localhost',
      block_height: 123,
      block_hash: Array(32).fill(0),
      intent_digest_32: input.intentDigest32,
    },
    webauthn_authentication: { ok: true },
  };
}

test.describe('threshold-ed25519 scope (express)', () => {
		  test('authorize binds signing digest; mpcSessionId is single-use; finalize discards signingSessionId', async () => {
		    const { service, threshold } = makeAuthServiceForThreshold();
		    const router = createRelayRouter(service, { threshold });
		    const srv = await startExpressRouter(router);
		    try {
	      const clientVerifyingShareB64u = await randomClientVerifyingShareB64u();
        const keygenBody = await buildKeygenBody({ nearAccountId: 'bob.testnet', clientVerifyingShareB64u });
	      const keygen = await fetchJson(`${srv.baseUrl}/threshold-ed25519/keygen`, {
	        method: 'POST',
	        headers: { 'Content-Type': 'application/json' },
	        body: JSON.stringify(keygenBody),
	      });
	      expect(keygen.status).toBe(200);
	      expect(keygen.json?.ok).toBe(true);
	      const relayerKeyId = String(keygen.json?.relayerKeyId || '');
	      expect(relayerKeyId).toContain('ed25519:');
      const nearPublicKeyStr = String(keygen.json?.publicKey || '');
      expect(nearPublicKeyStr).toContain('ed25519:');
      (service as unknown as { __testAllowedNearPublicKey?: string }).__testAllowedNearPublicKey = nearPublicKeyStr;

      const { body: authorizeBody, signingDigestB64u } = await buildNearTxAuthorizeBody({
        relayerKeyId,
        nearAccountId: 'bob.testnet',
        nearPublicKeyStr,
        receiverId: 'receiver.testnet',
        actions: [{ action_type: ActionType.Transfer, deposit: '1' }],
      });
      const auth = await fetchJson(`${srv.baseUrl}/threshold-ed25519/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authorizeBody),
      });
      expect(auth.status).toBe(200);
      expect(auth.json?.ok).toBe(true);
      const mpcSessionId = String(auth.json?.mpcSessionId || '');
      expect(mpcSessionId).toContain('mpc-');

      const init = await fetchJson(`${srv.baseUrl}/threshold-ed25519/sign/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mpcSessionId,
          relayerKeyId,
          nearAccountId: 'bob.testnet',
          signingDigestB64u,
          clientCommitments: { hiding: 'a', binding: 'b' },
        }),
      });
      expect(init.status).toBe(200);
      expect(init.json?.ok).toBe(true);
      const signingSessionId = String(init.json?.signingSessionId || '');
      expect(signingSessionId).toContain('sign-');

      // mpcSessionId is one-shot after a successful /sign/init.
      const initReplay = await fetchJson(`${srv.baseUrl}/threshold-ed25519/sign/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mpcSessionId,
          relayerKeyId,
          nearAccountId: 'bob.testnet',
          signingDigestB64u,
          clientCommitments: { hiding: 'a', binding: 'b' },
        }),
      });
      expect(initReplay.status).toBe(401);
      expect(initReplay.json?.code).toBe('unauthorized');

      // finalize always consumes signingSessionId (even on invalid inputs) to avoid nonce reuse.
      const finalize1 = await fetchJson(`${srv.baseUrl}/threshold-ed25519/sign/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signingSessionId, clientSignatureShareB64u: 'not-base64url' }),
      });
      expect([400, 401, 500]).toContain(finalize1.status);

      const finalize2 = await fetchJson(`${srv.baseUrl}/threshold-ed25519/sign/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signingSessionId, clientSignatureShareB64u: 'not-base64url' }),
      });
      expect(finalize2.status).toBe(401);
      expect(finalize2.json?.code).toBe('unauthorized');
    } finally {
      await srv.close();
    }
  });

		  test('sign/init rejects digest mismatch and nearAccountId mismatch', async () => {
		    const { service, threshold } = makeAuthServiceForThreshold();
		    const router = createRelayRouter(service, { threshold });
		    const srv = await startExpressRouter(router);
		    try {
	      const clientVerifyingShareB64u = await randomClientVerifyingShareB64u();
        const keygenBody = await buildKeygenBody({ nearAccountId: 'bob.testnet', clientVerifyingShareB64u });
	      const keygen = await fetchJson(`${srv.baseUrl}/threshold-ed25519/keygen`, {
	        method: 'POST',
	        headers: { 'Content-Type': 'application/json' },
	        body: JSON.stringify(keygenBody),
	      });
	      expect(keygen.status).toBe(200);
	      const relayerKeyId = String(keygen.json?.relayerKeyId || '');
	      const nearPublicKeyStr = String(keygen.json?.publicKey || '');
      (service as unknown as { __testAllowedNearPublicKey?: string }).__testAllowedNearPublicKey = nearPublicKeyStr;

      const { body: authorizeBody, signingDigestB64u } = await buildNearTxAuthorizeBody({
        relayerKeyId,
        nearAccountId: 'bob.testnet',
        nearPublicKeyStr,
        receiverId: 'receiver.testnet',
        actions: [{ action_type: ActionType.Transfer, deposit: '1' }],
      });
      const digestB = randomBytes32();

      const auth = await fetchJson(`${srv.baseUrl}/threshold-ed25519/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authorizeBody),
      });
      expect(auth.status).toBe(200);
      const mpcSessionId = String(auth.json?.mpcSessionId || '');

      const badDigest = await fetchJson(`${srv.baseUrl}/threshold-ed25519/sign/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mpcSessionId,
          relayerKeyId,
          nearAccountId: 'bob.testnet',
          signingDigestB64u: base64UrlEncode(digestB),
          clientCommitments: { hiding: 'a', binding: 'b' },
        }),
      });
      expect(badDigest.status).toBe(401);
      expect(badDigest.json?.code).toBe('unauthorized');

      // New authorization for account mismatch check.
      const auth2 = await fetchJson(`${srv.baseUrl}/threshold-ed25519/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authorizeBody),
      });
      expect(auth2.status).toBe(200);
      const mpc2 = String(auth2.json?.mpcSessionId || '');

      const badAccount = await fetchJson(`${srv.baseUrl}/threshold-ed25519/sign/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mpcSessionId: mpc2,
          relayerKeyId,
          nearAccountId: 'alice.testnet',
          signingDigestB64u,
          clientCommitments: { hiding: 'a', binding: 'b' },
        }),
      });
      expect(badAccount.status).toBe(401);
      expect(badAccount.json?.code).toBe('unauthorized');
    } finally {
      await srv.close();
    }
  });

		  test('authorize rejects missing signing_digest_32', async () => {
		    const { service, threshold } = makeAuthServiceForThreshold();
		    const router = createRelayRouter(service, { threshold });
		    const srv = await startExpressRouter(router);
		    try {
	      const clientVerifyingShareB64u = await randomClientVerifyingShareB64u();
        const keygenBody = await buildKeygenBody({ nearAccountId: 'bob.testnet', clientVerifyingShareB64u });
	      const keygen = await fetchJson(`${srv.baseUrl}/threshold-ed25519/keygen`, {
	        method: 'POST',
	        headers: { 'Content-Type': 'application/json' },
	        body: JSON.stringify(keygenBody),
	      });
	      expect(keygen.status).toBe(200);
	      const relayerKeyId = String(keygen.json?.relayerKeyId || '');
      const nearPublicKeyStr = String(keygen.json?.publicKey || '');
      (service as unknown as { __testAllowedNearPublicKey?: string }).__testAllowedNearPublicKey = nearPublicKeyStr;

      const intentDigest32 = Array.from(randomBytes32());
      const res = await fetchJson(`${srv.baseUrl}/threshold-ed25519/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relayerKeyId,
          purpose: 'near_tx',
          vrf_data: {
            vrf_input_data: Array(32).fill(0),
            vrf_output: [1],
            vrf_proof: [2],
            public_key: [3],
            user_id: 'bob.testnet',
            rp_id: 'example.localhost',
            block_height: 123,
            block_hash: Array(32).fill(0),
            intent_digest_32: intentDigest32,
          },
          webauthn_authentication: { ok: true },
        }),
      });
      expect(res.status).toBe(400);
      expect(res.json?.code).toBe('invalid_body');
    } finally {
      await srv.close();
    }
  });
});

test.describe('threshold-ed25519 scope (cloudflare)', () => {
  test('mpcSessionId and signingSessionId scopes are enforced', async () => {
    const { service, threshold } = makeAuthServiceForThreshold();
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'], threshold });
    const { ctx } = makeCfCtx();

    const clientVerifyingShareB64u = await randomClientVerifyingShareB64u();
    const keygenBody = await buildKeygenBody({ nearAccountId: 'bob.testnet', clientVerifyingShareB64u });
    const keygen = await callCf(handler, {
      method: 'POST',
      path: '/threshold-ed25519/keygen',
      origin: 'https://example.localhost',
      body: keygenBody,
      ctx,
    });
    expect(keygen.status).toBe(200);
    expect(keygen.json?.ok).toBe(true);
    const relayerKeyId = String(keygen.json?.relayerKeyId || '');
    const nearPublicKeyStr = String(keygen.json?.publicKey || '');
    (service as unknown as { __testAllowedNearPublicKey?: string }).__testAllowedNearPublicKey = nearPublicKeyStr;

    const { body: authorizeBody, signingDigestB64u } = await buildNearTxAuthorizeBody({
      relayerKeyId,
      nearAccountId: 'bob.testnet',
      nearPublicKeyStr,
      receiverId: 'receiver.testnet',
      actions: [{ action_type: ActionType.Transfer, deposit: '1' }],
    });
    const auth = await callCf(handler, {
      method: 'POST',
      path: '/threshold-ed25519/authorize',
      origin: 'https://example.localhost',
      body: authorizeBody,
      ctx,
    });
    expect(auth.status).toBe(200);
    expect(auth.json?.ok).toBe(true);
    const mpcSessionId = String(auth.json?.mpcSessionId || '');

    const init = await callCf(handler, {
      method: 'POST',
      path: '/threshold-ed25519/sign/init',
      origin: 'https://example.localhost',
      body: {
        mpcSessionId,
        relayerKeyId,
        nearAccountId: 'bob.testnet',
        signingDigestB64u,
        clientCommitments: { hiding: 'a', binding: 'b' },
      },
      ctx,
    });
    expect(init.status).toBe(200);
    expect(init.json?.ok).toBe(true);
    const signingSessionId = String(init.json?.signingSessionId || '');

    const initReplay = await callCf(handler, {
      method: 'POST',
      path: '/threshold-ed25519/sign/init',
      origin: 'https://example.localhost',
      body: {
        mpcSessionId,
        relayerKeyId,
        nearAccountId: 'bob.testnet',
        signingDigestB64u,
        clientCommitments: { hiding: 'a', binding: 'b' },
      },
      ctx,
    });
    expect(initReplay.status).toBe(401);
    expect(initReplay.json?.code).toBe('unauthorized');

    const finalize1 = await callCf(handler, {
      method: 'POST',
      path: '/threshold-ed25519/sign/finalize',
      origin: 'https://example.localhost',
      body: { signingSessionId, clientSignatureShareB64u: 'not-base64url' },
      ctx,
    });
    expect([400, 401, 500]).toContain(finalize1.status);

    const finalize2 = await callCf(handler, {
      method: 'POST',
      path: '/threshold-ed25519/sign/finalize',
      origin: 'https://example.localhost',
      body: { signingSessionId, clientSignatureShareB64u: 'not-base64url' },
      ctx,
    });
    expect(finalize2.status).toBe(401);
    expect(finalize2.json?.code).toBe('unauthorized');
  });
});
