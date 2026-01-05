import type { NormalizedLogger } from '../logger';
import { base64UrlDecode, base64UrlEncode } from '../../../utils/encoders';
import type { AccessKeyList } from '../../../core/NearClient';
import type { ThresholdEd25519KeyStore } from './ThresholdEd25519KeyStore';
import type {
  ThresholdEd25519SessionStore,
  ThresholdEd25519Commitments,
} from './ThresholdEd25519SessionStore';
import type {
  VerifyAuthenticationRequest,
  VerifyAuthenticationResponse,
  ThresholdEd25519AuthorizeRequest,
  ThresholdEd25519AuthorizeResponse,
  ThresholdEd25519KeygenRequest,
  ThresholdEd25519KeygenResponse,
  ThresholdEd25519SignInitRequest,
  ThresholdEd25519SignInitResponse,
  ThresholdEd25519SignFinalizeRequest,
  ThresholdEd25519SignFinalizeResponse,
} from '../types';
import {
  threshold_ed25519_compute_delegate_signing_digest,
  threshold_ed25519_compute_near_tx_signing_digests,
  threshold_ed25519_compute_nep413_signing_digest,
  threshold_ed25519_keygen_from_client_verifying_share,
  threshold_ed25519_round1_commit,
  threshold_ed25519_round2_sign,
} from '../../../wasm_signer_worker/pkg/wasm_signer_worker.js';
import {
  bytesEqual32,
  ensureRelayerKeyIsActiveAccessKey,
  extractAuthorizeSigningPublicKey,
  isObject,
  normalizeByteArray32,
  normalizeOptionalString,
  verifyThresholdEd25519AuthorizeSigningPayload,
} from './validation';
import { alphabetizeStringify, sha256BytesUtf8 } from '../../../utils/digests';

export class ThresholdEd25519Service {
  private readonly logger: NormalizedLogger;
  private readonly keyStore: ThresholdEd25519KeyStore;
  private readonly sessionStore: ThresholdEd25519SessionStore;
  private readonly ensureReady: () => Promise<void>;
  private readonly ensureSignerWasm: () => Promise<void>;
  private readonly verifyAuthenticationResponse: (
    request: VerifyAuthenticationRequest
  ) => Promise<VerifyAuthenticationResponse>;
  private readonly viewAccessKeyList: (accountId: string) => Promise<AccessKeyList>;

  constructor(input: {
    logger: NormalizedLogger;
    keyStore: ThresholdEd25519KeyStore;
    sessionStore: ThresholdEd25519SessionStore;
    ensureReady: () => Promise<void>;
    ensureSignerWasm: () => Promise<void>;
    verifyAuthenticationResponse: (request: VerifyAuthenticationRequest) => Promise<VerifyAuthenticationResponse>;
    viewAccessKeyList: (accountId: string) => Promise<AccessKeyList>;
  }) {
    this.logger = input.logger;
    this.keyStore = input.keyStore;
    this.sessionStore = input.sessionStore;
    this.ensureReady = input.ensureReady;
    this.ensureSignerWasm = input.ensureSignerWasm;
    this.verifyAuthenticationResponse = input.verifyAuthenticationResponse;
    this.viewAccessKeyList = input.viewAccessKeyList;
  }

  private createThresholdEd25519MpcSessionId(): string {
    const id = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `mpc-${id}`;
  }

  private createThresholdEd25519SigningSessionId(): string {
    const id = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `sign-${id}`;
  }

  /**
   * Registration helper (no WebAuthn verification):
   * compute a threshold group key from the client's verifying share and return the relayer share
   * material. Callers should persist the relayer share only after the on-chain AddKey is confirmed.
   */
  async keygenFromClientVerifyingShareForRegistration(input: {
    clientVerifyingShareB64u: string;
  }): Promise<
    | {
        ok: true;
        relayerKeyId: string;
        publicKey: string;
        relayerSigningShareB64u: string;
        relayerVerifyingShareB64u: string;
      }
    | { ok: false; code: string; message: string }
  > {
    try {
      await this.ensureReady();
      await this.ensureSignerWasm();
      const clientVerifyingShareB64u = normalizeOptionalString(input.clientVerifyingShareB64u);
      if (!clientVerifyingShareB64u) {
        return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
      }

      const outUnknown: unknown = threshold_ed25519_keygen_from_client_verifying_share(clientVerifyingShareB64u);
      const out = isObject(outUnknown) ? outUnknown : null;
      const relayerKeyId = normalizeOptionalString(out?.relayerKeyId);
      const publicKey = normalizeOptionalString(out?.publicKey);
      const relayerSigningShareB64u = normalizeOptionalString(out?.relayerSigningShareB64u);
      const relayerVerifyingShareB64u = normalizeOptionalString(out?.relayerVerifyingShareB64u);

      if (!relayerKeyId || !publicKey || !relayerSigningShareB64u || !relayerVerifyingShareB64u) {
        return { ok: false, code: 'internal', message: 'threshold-ed25519 keygen returned incomplete output' };
      }

      return { ok: true, relayerKeyId, publicKey, relayerSigningShareB64u, relayerVerifyingShareB64u };
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    }
  }

  async putRelayerKeyMaterial(input: {
    relayerKeyId: string;
    publicKey: string;
    relayerSigningShareB64u: string;
    relayerVerifyingShareB64u: string;
  }): Promise<void> {
    const relayerKeyId = normalizeOptionalString(input.relayerKeyId);
    if (!relayerKeyId) throw new Error('Missing relayerKeyId');
    await this.keyStore.put(relayerKeyId, {
      publicKey: normalizeOptionalString(input.publicKey),
      relayerSigningShareB64u: normalizeOptionalString(input.relayerSigningShareB64u),
      relayerVerifyingShareB64u: normalizeOptionalString(input.relayerVerifyingShareB64u),
    });
  }

  async thresholdEd25519Keygen(request: ThresholdEd25519KeygenRequest): Promise<ThresholdEd25519KeygenResponse> {
    try {
      await this.ensureReady();

      const nearAccountId = normalizeOptionalString(request.nearAccountId);
      if (!nearAccountId) {
        return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };
      }

      const clientVerifyingShareB64u = normalizeOptionalString(request.clientVerifyingShareB64u);
      if (!clientVerifyingShareB64u) {
        return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
      }

      const vrfData = request.vrf_data;
      const vrfUserId = normalizeOptionalString(vrfData.user_id);
      if (!vrfUserId) {
        return { ok: false, code: 'invalid_body', message: 'vrf_data.user_id is required' };
      }
      if (vrfUserId !== nearAccountId) {
        return { ok: false, code: 'unauthorized', message: 'nearAccountId must match vrf_data.user_id' };
      }

      const rpId = normalizeOptionalString(vrfData.rp_id);
      if (!rpId) {
        return { ok: false, code: 'invalid_body', message: 'vrf_data.rp_id is required' };
      }

      const intentDigest32 = normalizeByteArray32(vrfData.intent_digest_32);
      if (!intentDigest32) {
        return {
          ok: false,
          code: 'invalid_body',
          message: 'vrf_data.intent_digest_32 (32 bytes) is required for threshold keygen',
        };
      }

      const expectedIntentJson = alphabetizeStringify({
        kind: 'threshold_ed25519_keygen',
        nearAccountId,
        rpId,
        clientVerifyingShareB64u,
      });
      const expectedIntentDigest32 = await sha256BytesUtf8(expectedIntentJson);
      if (!bytesEqual32(expectedIntentDigest32, intentDigest32)) {
        return {
          ok: false,
          code: 'intent_digest_mismatch',
          message: 'vrf_data.intent_digest_32 does not match expected keygen binding',
        };
      }

      const verification = await this.verifyAuthenticationResponse({
        vrf_data: vrfData,
        webauthn_authentication: request.webauthn_authentication,
      });

      if (!verification.success || !verification.verified) {
        return {
          ok: false,
          code: verification.code || 'not_verified',
          message: verification.message || 'Authentication verification failed',
        };
      }

      await this.ensureSignerWasm();
      const outUnknown: unknown = threshold_ed25519_keygen_from_client_verifying_share(clientVerifyingShareB64u);
      const out = isObject(outUnknown) ? outUnknown : null;
      const relayerKeyId = normalizeOptionalString(out?.relayerKeyId);
      const publicKey = normalizeOptionalString(out?.publicKey);
      const relayerSigningShareB64u = normalizeOptionalString(out?.relayerSigningShareB64u);
      const relayerVerifyingShareB64u = normalizeOptionalString(out?.relayerVerifyingShareB64u);

      if (!relayerKeyId || !publicKey || !relayerSigningShareB64u || !relayerVerifyingShareB64u) {
        return { ok: false, code: 'internal', message: 'threshold-ed25519 keygen returned incomplete output' };
      }

      await this.keyStore.put(relayerKeyId, {
        publicKey,
        relayerSigningShareB64u,
        relayerVerifyingShareB64u,
      });

      return {
        ok: true,
        relayerKeyId,
        publicKey,
        relayerVerifyingShareB64u,
      };
    } catch (e: unknown) {
      this.logger?.error?.('thresholdEd25519Keygen failed:', e);
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    }
  }

  async authorizeThresholdEd25519(request: ThresholdEd25519AuthorizeRequest): Promise<ThresholdEd25519AuthorizeResponse> {
    try {
      await this.ensureReady();

      const relayerKeyId = normalizeOptionalString(request.relayerKeyId);
      if (!relayerKeyId) {
        return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };
      }
      const relayerKey = await this.keyStore.get(relayerKeyId);
      if (!relayerKey) {
        return { ok: false, code: 'missing_key', message: 'Unknown relayerKeyId; call /threshold-ed25519/keygen first' };
      }

      const purpose = normalizeOptionalString(request.purpose);
      if (!purpose) {
        return { ok: false, code: 'invalid_body', message: 'purpose is required' };
      }

      const userId = normalizeOptionalString(request.vrf_data.user_id);
      if (!userId) {
        return { ok: false, code: 'invalid_body', message: 'vrf_data.user_id is required' };
      }

      const rpId = normalizeOptionalString(request.vrf_data.rp_id);
      if (!rpId) {
        return { ok: false, code: 'invalid_body', message: 'vrf_data.rp_id is required' };
      }

      const intentDigest32 = normalizeByteArray32(request.vrf_data.intent_digest_32);
      if (!intentDigest32) {
        return {
          ok: false,
          code: 'invalid_body',
          message: 'vrf_data.intent_digest_32 (32 bytes) is required for threshold authorization',
        };
      }

      const signingDigest32 = normalizeByteArray32(request.signing_digest_32);
      if (!signingDigest32) {
        return {
          ok: false,
          code: 'invalid_body',
          message: 'signing_digest_32 (32 bytes) is required for threshold authorization',
        };
      }

      const signingPayload = request.signingPayload;
      const verifyPayload = await verifyThresholdEd25519AuthorizeSigningPayload({
        purpose,
        signingPayload,
        signingDigest32,
        intentDigest32,
        userId,
        ensureSignerWasm: this.ensureSignerWasm,
        computeNearTxSigningDigests: threshold_ed25519_compute_near_tx_signing_digests,
        computeDelegateSigningDigest: threshold_ed25519_compute_delegate_signing_digest,
        computeNep413SigningDigest: threshold_ed25519_compute_nep413_signing_digest,
      });
      if (!verifyPayload.ok) {
        return { ok: false, code: verifyPayload.code, message: verifyPayload.message };
      }

      const verification = await this.verifyAuthenticationResponse({
        vrf_data: request.vrf_data,
        webauthn_authentication: request.webauthn_authentication,
      });

      if (!verification.success || !verification.verified) {
        return {
          ok: false,
          code: verification.code || 'not_verified',
          message: verification.message || 'Authentication verification failed',
        };
      }

      // Tighten scope: ensure the relayerKeyId public key is actually an access key on nearAccountId.
      const expectedSigningPublicKey = extractAuthorizeSigningPublicKey(purpose, signingPayload);
      const scope = await ensureRelayerKeyIsActiveAccessKey({
        nearAccountId: userId,
        relayerPublicKey: relayerKey.publicKey,
        ...(expectedSigningPublicKey ? { expectedSigningPublicKey } : {}),
        viewAccessKeyList: this.viewAccessKeyList,
      });
      if (!scope.ok) {
        return { ok: false, code: scope.code, message: scope.message };
      }

      const ttlMs = 60_000;
      const expiresAtMs = Date.now() + ttlMs; // short-lived single-use authorization
      const mpcSessionId = this.createThresholdEd25519MpcSessionId();
      await this.sessionStore.putMpcSession(mpcSessionId, {
        expiresAtMs,
        relayerKeyId,
        purpose,
        intentDigestB64u: base64UrlEncode(intentDigest32),
        signingDigestB64u: base64UrlEncode(signingDigest32),
        userId,
        rpId,
      }, ttlMs);

      return {
        ok: true,
        mpcSessionId,
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    }
  }

  async thresholdEd25519SignInit(request: ThresholdEd25519SignInitRequest): Promise<ThresholdEd25519SignInitResponse> {
    try {
      await this.ensureReady();
      const mpcSessionId = normalizeOptionalString(request.mpcSessionId);
      if (!mpcSessionId) {
        return { ok: false, code: 'invalid_body', message: 'mpcSessionId is required' };
      }
      const sess = await this.sessionStore.takeMpcSession(mpcSessionId);
      if (!sess) {
        return { ok: false, code: 'unauthorized', message: 'mpcSessionId expired or invalid' };
      }
      if (Date.now() > sess.expiresAtMs) {
        return { ok: false, code: 'unauthorized', message: 'mpcSessionId expired' };
      }

      const relayerKeyId = normalizeOptionalString(request.relayerKeyId);
      if (!relayerKeyId) {
        return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };
      }
      if (relayerKeyId !== sess.relayerKeyId) {
        return { ok: false, code: 'unauthorized', message: 'relayerKeyId does not match mpcSessionId scope' };
      }

      const nearAccountId = normalizeOptionalString(request.nearAccountId);
      if (!nearAccountId) {
        return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };
      }
      if (nearAccountId !== sess.userId) {
        return { ok: false, code: 'unauthorized', message: 'nearAccountId does not match mpcSessionId scope' };
      }

      const signingDigestB64u = normalizeOptionalString(request.signingDigestB64u);
      if (!signingDigestB64u) {
        return { ok: false, code: 'invalid_body', message: 'signingDigestB64u is required' };
      }
      let signingDigestBytes: Uint8Array;
      try {
        signingDigestBytes = base64UrlDecode(signingDigestB64u);
      } catch {
        return { ok: false, code: 'invalid_body', message: 'signingDigestB64u is not valid base64url' };
      }
      if (signingDigestBytes.length !== 32) {
        return { ok: false, code: 'invalid_body', message: `signingDigestB64u must decode to 32 bytes, got ${signingDigestBytes.length}` };
      }
      if (signingDigestB64u !== sess.signingDigestB64u) {
        return { ok: false, code: 'unauthorized', message: 'signingDigestB64u does not match mpcSessionId scope' };
      }

      const clientCommitments: ThresholdEd25519Commitments = {
        hiding: normalizeOptionalString(request.clientCommitments?.hiding),
        binding: normalizeOptionalString(request.clientCommitments?.binding),
      };
      if (!clientCommitments.hiding || !clientCommitments.binding) {
        return { ok: false, code: 'invalid_body', message: 'clientCommitments{hiding,binding} are required' };
      }

      const key = await this.keyStore.get(relayerKeyId);
      if (!key) {
        return { ok: false, code: 'missing_key', message: 'Unknown relayerKeyId; call /threshold-ed25519/keygen first' };
      }

      // Tighten scope: ensure relayerKeyId public key is actually an access key on nearAccountId.
      const scope = await ensureRelayerKeyIsActiveAccessKey({
        nearAccountId,
        relayerPublicKey: key.publicKey,
        viewAccessKeyList: this.viewAccessKeyList,
      });
      if (!scope.ok) {
        return { ok: false, code: scope.code, message: scope.message };
      }

      await this.ensureSignerWasm();
      const commitUnknown: unknown = threshold_ed25519_round1_commit(key.relayerSigningShareB64u);
      const commit = isObject(commitUnknown) ? commitUnknown : null;
      const relayerNoncesB64u = normalizeOptionalString(commit?.relayerNoncesB64u);
      const relayerCommitmentsObj = isObject(commit?.relayerCommitments)
        ? commit?.relayerCommitments
        : null;
      const relayerCommitments: ThresholdEd25519Commitments = {
        hiding: normalizeOptionalString(relayerCommitmentsObj?.hiding),
        binding: normalizeOptionalString(relayerCommitmentsObj?.binding),
      };
      if (!relayerNoncesB64u || !relayerCommitments.hiding || !relayerCommitments.binding) {
        return { ok: false, code: 'internal', message: 'threshold-ed25519 /sign/init: invalid relayer commitments' };
      }

      const signingSessionId = this.createThresholdEd25519SigningSessionId();
      const ttlMs = 60_000;
      const expiresAtMs = Date.now() + ttlMs;
      await this.sessionStore.putSigningSession(signingSessionId, {
        expiresAtMs,
        mpcSessionId,
        relayerKeyId,
        signingDigestB64u,
        clientCommitments,
        relayerCommitments,
        relayerNoncesB64u,
      }, ttlMs);

      return {
        ok: true,
        signingSessionId,
        relayerCommitments,
        relayerVerifyingShareB64u: key.relayerVerifyingShareB64u,
      };
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    }
  }

  async thresholdEd25519SignFinalize(request: ThresholdEd25519SignFinalizeRequest): Promise<ThresholdEd25519SignFinalizeResponse> {
    try {
      await this.ensureReady();
      const signingSessionId = normalizeOptionalString(request.signingSessionId);
      if (!signingSessionId) {
        return { ok: false, code: 'invalid_body', message: 'signingSessionId is required' };
      }
      const clientSignatureShareB64u = normalizeOptionalString(request.clientSignatureShareB64u);
      if (!clientSignatureShareB64u) {
        return { ok: false, code: 'invalid_body', message: 'clientSignatureShareB64u is required' };
      }

      const sess = await this.sessionStore.takeSigningSession(signingSessionId);
      if (!sess) {
        return { ok: false, code: 'unauthorized', message: 'signingSessionId expired or invalid' };
      }
      if (Date.now() > sess.expiresAtMs) {
        return { ok: false, code: 'unauthorized', message: 'signingSessionId expired' };
      }

      const key = await this.keyStore.get(sess.relayerKeyId);
      if (!key) {
        return { ok: false, code: 'missing_key', message: 'Unknown relayerKeyId for signing session' };
      }

      await this.ensureSignerWasm();
      const outUnknown: unknown = threshold_ed25519_round2_sign({
        relayerSigningShareB64u: key.relayerSigningShareB64u,
        relayerNoncesB64u: sess.relayerNoncesB64u,
        groupPublicKey: key.publicKey,
        signingDigestB64u: sess.signingDigestB64u,
        clientCommitments: sess.clientCommitments,
        relayerCommitments: sess.relayerCommitments,
      });
      const out = isObject(outUnknown) ? outUnknown : null;
      const relayerSignatureShareB64u = normalizeOptionalString(out?.relayerSignatureShareB64u);
      if (!relayerSignatureShareB64u) {
        return { ok: false, code: 'internal', message: 'threshold-ed25519 /sign/finalize: missing relayerSignatureShareB64u' };
      }

      // signature aggregation is handled by the client coordinator.
      return { ok: true, relayerSignatureShareB64u };
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    }
  }
}
