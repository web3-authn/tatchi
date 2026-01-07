import type { NormalizedLogger } from '../logger';
import { base64Decode, base64UrlDecode, base64UrlEncode } from '../../../utils/encoders';
import type { AccessKeyList } from '../../../core/NearClient';
import type { FinalExecutionOutcome } from '@near-js/types';
import type { ThresholdEd25519KeyStore } from './ThresholdEd25519KeyStore';
import type {
  ThresholdEd25519SessionStore,
  ThresholdEd25519Commitments,
} from './ThresholdEd25519SessionStore';
import type {
  ThresholdEd25519AuthSessionStore,
  ThresholdEd25519AuthSessionRecord,
} from './ThresholdEd25519AuthSessionStore';
import type {
  VerifyAuthenticationRequest,
  VerifyAuthenticationResponse,
  ThresholdEd25519AuthorizeRequest,
  ThresholdEd25519AuthorizeResponse,
  ThresholdEd25519SessionRequest,
  ThresholdEd25519SessionResponse,
  ThresholdEd25519AuthorizeWithSessionRequest,
  ThresholdEd25519KeygenRequest,
  ThresholdEd25519KeygenResponse,
  ThresholdEd25519SignInitRequest,
  ThresholdEd25519SignInitResponse,
  ThresholdEd25519SignFinalizeRequest,
  ThresholdEd25519SignFinalizeResponse,
  ThresholdEd25519KeyStoreConfigInput,
} from '../types';
import {
  threshold_ed25519_compute_delegate_signing_digest,
  threshold_ed25519_compute_near_tx_signing_digests,
  threshold_ed25519_compute_nep413_signing_digest,
  threshold_ed25519_keygen_from_client_verifying_share,
  threshold_ed25519_keygen_from_master_secret_and_client_verifying_share,
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
  verifyThresholdEd25519AuthorizeSigningPayloadSigningDigestOnly,
  verifyThresholdEd25519AuthorizeSigningPayload,
} from './validation';
import { alphabetizeStringify, sha256BytesUtf8 } from '../../../utils/digests';

type ThresholdEd25519ShareMode = 'auto' | 'kv' | 'derived';

function normalizeThresholdEd25519ShareMode(input: unknown): ThresholdEd25519ShareMode {
  const mode = normalizeOptionalString(input);
  if (mode === 'kv' || mode === 'derived' || mode === 'auto') return mode;
  return 'auto';
}

type ThresholdEd25519KeygenWasmOutput = {
  relayerKeyId: string;
  publicKey: string;
  relayerSigningShareB64u: string;
  relayerVerifyingShareB64u: string;
};

function expectThresholdEd25519KeygenWasmOutput(out: unknown): ThresholdEd25519KeygenWasmOutput {
  const parsed = out as ThresholdEd25519KeygenWasmOutput;
  if (
    !parsed?.relayerKeyId ||
    !parsed?.publicKey ||
    !parsed?.relayerSigningShareB64u ||
    !parsed?.relayerVerifyingShareB64u
  ) {
    throw new Error('threshold-ed25519 keygen returned incomplete output');
  }
  return parsed;
}

type ThresholdEd25519Round1CommitWasmOutput = {
  relayerNoncesB64u: string;
  relayerCommitments: ThresholdEd25519Commitments;
};

function expectThresholdEd25519Round1CommitWasmOutput(out: unknown): ThresholdEd25519Round1CommitWasmOutput {
  const parsed = out as ThresholdEd25519Round1CommitWasmOutput;
  if (!parsed?.relayerNoncesB64u || !parsed?.relayerCommitments?.hiding || !parsed?.relayerCommitments?.binding) {
    throw new Error('threshold-ed25519 /sign/init: invalid relayer commitments');
  }
  return parsed;
}

type ThresholdEd25519Round2SignWasmOutput = {
  relayerSignatureShareB64u: string;
};

function expectThresholdEd25519Round2SignWasmOutput(out: unknown): ThresholdEd25519Round2SignWasmOutput {
  const parsed = out as ThresholdEd25519Round2SignWasmOutput;
  if (!parsed?.relayerSignatureShareB64u) {
    throw new Error('threshold-ed25519 /sign/finalize: missing relayerSignatureShareB64u');
  }
  return parsed;
}

export class ThresholdEd25519Service {
  private readonly logger: NormalizedLogger;
  private readonly keyStore: ThresholdEd25519KeyStore;
  private readonly sessionStore: ThresholdEd25519SessionStore;
  private readonly authSessionStore: ThresholdEd25519AuthSessionStore;
  private readonly shareMode: ThresholdEd25519ShareMode;
  private readonly relayerMasterSecretB64u: string | null;
  private readonly ensureReady: () => Promise<void>;
  private readonly ensureSignerWasm: () => Promise<void>;
  private readonly verifyAuthenticationResponse: (
    request: VerifyAuthenticationRequest
  ) => Promise<VerifyAuthenticationResponse>;
  private readonly viewAccessKeyList: (accountId: string) => Promise<AccessKeyList>;
  private readonly txStatus: (txHash: string, senderAccountId: string) => Promise<FinalExecutionOutcome>;
  private readonly webAuthnContractId: string;

  constructor(input: {
    logger: NormalizedLogger;
    keyStore: ThresholdEd25519KeyStore;
    sessionStore: ThresholdEd25519SessionStore;
    authSessionStore: ThresholdEd25519AuthSessionStore;
    config?: ThresholdEd25519KeyStoreConfigInput | null;
    ensureReady: () => Promise<void>;
    ensureSignerWasm: () => Promise<void>;
    verifyAuthenticationResponse: (request: VerifyAuthenticationRequest) => Promise<VerifyAuthenticationResponse>;
    viewAccessKeyList: (accountId: string) => Promise<AccessKeyList>;
    txStatus: (txHash: string, senderAccountId: string) => Promise<FinalExecutionOutcome>;
    webAuthnContractId: string;
  }) {
    this.logger = input.logger;
    this.keyStore = input.keyStore;
    this.sessionStore = input.sessionStore;
    this.authSessionStore = input.authSessionStore;
    const cfg = (isObject(input.config) ? input.config : {}) as Record<string, unknown>;
    this.shareMode = normalizeThresholdEd25519ShareMode(cfg.THRESHOLD_ED25519_SHARE_MODE);
    this.relayerMasterSecretB64u = normalizeOptionalString(cfg.THRESHOLD_ED25519_MASTER_SECRET_B64U);
    if (this.shareMode === 'derived' && !this.relayerMasterSecretB64u) {
      throw new Error('threshold-ed25519 derived share mode requires THRESHOLD_ED25519_MASTER_SECRET_B64U');
    }
    if (this.relayerMasterSecretB64u) {
      const decoded = base64UrlDecode(this.relayerMasterSecretB64u);
      if (decoded.length !== 32) {
        throw new Error(`THRESHOLD_ED25519_MASTER_SECRET_B64U must decode to 32 bytes, got ${decoded.length}`);
      }
    }
    this.ensureReady = input.ensureReady;
    this.ensureSignerWasm = input.ensureSignerWasm;
    this.verifyAuthenticationResponse = input.verifyAuthenticationResponse;
    this.viewAccessKeyList = input.viewAccessKeyList;
    this.txStatus = input.txStatus;
    this.webAuthnContractId = input.webAuthnContractId;
  }

  private useDerivedRelayerShares(): boolean {
    if (this.shareMode === 'derived') return true;
    if (this.shareMode === 'kv') return false;
    return Boolean(this.relayerMasterSecretB64u);
  }

  private async deriveRelayerKeyMaterial(input: {
    nearAccountId: string;
    rpId: string;
    clientVerifyingShareB64u: string;
    expectedRelayerKeyId: string;
  }): Promise<
    | { ok: true; publicKey: string; relayerSigningShareB64u: string; relayerVerifyingShareB64u: string }
    | { ok: false; code: string; message: string }
  > {
    const masterSecretB64u = normalizeOptionalString(this.relayerMasterSecretB64u);
    if (!masterSecretB64u) {
      return { ok: false, code: 'missing_config', message: 'Missing THRESHOLD_ED25519_MASTER_SECRET_B64U for derived share mode' };
    }

    await this.ensureSignerWasm();
    const out = expectThresholdEd25519KeygenWasmOutput(
      threshold_ed25519_keygen_from_master_secret_and_client_verifying_share(
        masterSecretB64u,
        input.nearAccountId,
        input.rpId,
        input.clientVerifyingShareB64u,
      ),
    );

    if (out.relayerKeyId !== input.expectedRelayerKeyId || out.publicKey !== input.expectedRelayerKeyId) {
      return {
        ok: false,
        code: 'group_pk_mismatch',
        message: 'clientVerifyingShareB64u does not match relayerKeyId',
      };
    }

    return {
      ok: true,
      publicKey: out.publicKey,
      relayerSigningShareB64u: out.relayerSigningShareB64u,
      relayerVerifyingShareB64u: out.relayerVerifyingShareB64u,
    };
  }

  private async resolveRelayerKeyMaterial(input: {
    relayerKeyId: string;
    nearAccountId: string;
    rpId: string;
    clientVerifyingShareB64u: string;
  }): Promise<
    | { ok: true; publicKey: string; relayerSigningShareB64u: string; relayerVerifyingShareB64u: string }
    | { ok: false; code: string; message: string }
  > {
    const relayerKeyId = normalizeOptionalString(input.relayerKeyId);
    if (!relayerKeyId) return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };

    if (this.shareMode !== 'derived') {
      const existing = await this.keyStore.get(relayerKeyId);
      if (existing) return { ok: true, ...existing };
      if (this.shareMode === 'kv') {
        return { ok: false, code: 'missing_key', message: 'Unknown relayerKeyId; call /threshold-ed25519/keygen first' };
      }
    }

    if (!this.useDerivedRelayerShares()) {
      return { ok: false, code: 'missing_key', message: 'Unknown relayerKeyId; call /threshold-ed25519/keygen first' };
    }

    const clientVerifyingShareB64u = normalizeOptionalString(input.clientVerifyingShareB64u);
    if (!clientVerifyingShareB64u) {
      return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
    }
    const nearAccountId = normalizeOptionalString(input.nearAccountId);
    if (!nearAccountId) return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };
    const rpId = normalizeOptionalString(input.rpId);
    if (!rpId) return { ok: false, code: 'invalid_body', message: 'rpId is required' };

    return this.deriveRelayerKeyMaterial({
      nearAccountId,
      rpId,
      clientVerifyingShareB64u,
      expectedRelayerKeyId: relayerKeyId,
    });
  }

  private clampSessionPolicy(input: { ttlMs: number; remainingUses: number }): { ttlMs: number; remainingUses: number } {
    const ttlMs = Math.max(0, Math.floor(Number(input.ttlMs) || 0));
    const remainingUses = Math.max(0, Math.floor(Number(input.remainingUses) || 0));
    // Hard caps (server-side). Session policy digest must be computed against these final values.
    const MAX_TTL_MS = 10 * 60_000;
    const MAX_USES = 20;
    return {
      ttlMs: Math.min(ttlMs, MAX_TTL_MS),
      remainingUses: Math.min(remainingUses, MAX_USES),
    };
  }

  private async computeSessionPolicyDigest32(policy: unknown): Promise<Uint8Array> {
    const json = alphabetizeStringify(policy);
    return await sha256BytesUtf8(json);
  }

  private async putAuthSessionRecord(input: {
    sessionId: string;
    record: ThresholdEd25519AuthSessionRecord;
    ttlMs: number;
    remainingUses: number;
  }): Promise<void> {
    await this.authSessionStore.putSession(input.sessionId, input.record, {
      ttlMs: input.ttlMs,
      remainingUses: input.remainingUses,
    });
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

  private getTxSuccessValueBase64(outcome: FinalExecutionOutcome): string | null {
    const status = (outcome as unknown as { status?: unknown })?.status;
    if (!status || typeof status !== 'object') return null;
    if (!('SuccessValue' in status)) return null;
    const value = (status as { SuccessValue?: unknown }).SuccessValue;
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private parseTxSuccessValueJson(outcome: FinalExecutionOutcome): unknown {
    const successValueB64 = this.getTxSuccessValueBase64(outcome);
    if (!successValueB64) return null;
    const bytes = base64Decode(successValueB64);
    const text = new TextDecoder().decode(bytes);
    if (!text.trim()) return null;
    return JSON.parse(text) as unknown;
  }

  private validateLinkDeviceRegistrationTx(
    outcome: FinalExecutionOutcome,
    expectedNearAccountId: string,
  ): { ok: true; rpId?: string } | { ok: false; code: string; message: string } {
    const txUnknown = (outcome as unknown as { transaction?: unknown })?.transaction;
    if (!txUnknown || typeof txUnknown !== 'object') {
      return { ok: false, code: 'unauthorized', message: 'Registration transaction missing transaction metadata' };
    }
    let rpId: string | null = null;
    const tx = txUnknown as Record<string, unknown>;
    const signerId = normalizeOptionalString(tx.signer_id ?? tx.signerId);
    if (signerId && signerId !== expectedNearAccountId) {
      return { ok: false, code: 'unauthorized', message: 'Registration transaction signer_id mismatch' };
    }
    const receiverId = normalizeOptionalString(tx.receiver_id ?? tx.receiverId);
    if (receiverId && receiverId !== this.webAuthnContractId) {
      return { ok: false, code: 'unauthorized', message: 'Registration transaction receiver_id mismatch' };
    }

    const actions = Array.isArray(tx.actions) ? (tx.actions as unknown[]) : [];
    const fnCalls = actions
      .map((action) => (action && typeof action === 'object')
        ? ((action as Record<string, unknown>).FunctionCall ?? (action as Record<string, unknown>).function_call ?? null)
        : null)
      .filter((v): v is Record<string, unknown> => Boolean(v && typeof v === 'object'));

    const linkDeviceCall = fnCalls.find((fc) => normalizeOptionalString(fc.method_name ?? fc.methodName) === 'link_device_register_user');
    if (!linkDeviceCall) {
      return { ok: false, code: 'unauthorized', message: 'Registration transaction is not link_device_register_user' };
    }

    const argsB64 = normalizeOptionalString(linkDeviceCall.args);
    if (argsB64) {
      try {
        const argsText = new TextDecoder().decode(base64Decode(argsB64));
        const parsedArgs = JSON.parse(argsText) as unknown;
        if (parsedArgs && typeof parsedArgs === 'object') {
          const vrf = (parsedArgs as { vrf_data?: unknown }).vrf_data;
          if (vrf && typeof vrf === 'object') {
            const userId = normalizeOptionalString((vrf as { user_id?: unknown; userId?: unknown }).user_id ?? (vrf as { userId?: unknown }).userId);
            if (userId && userId !== expectedNearAccountId) {
              return { ok: false, code: 'unauthorized', message: 'Registration transaction vrf_data.user_id mismatch' };
            }
            rpId = normalizeOptionalString((vrf as { rp_id?: unknown; rpId?: unknown }).rp_id ?? (vrf as { rpId?: unknown }).rpId) || rpId;
          }
        }
      } catch {
        // tolerate arg decode/parse errors; we still validate via SuccessValue below.
      }
    }

    const successJson = this.parseTxSuccessValueJson(outcome);
    if (!successJson || typeof successJson !== 'object') {
      return { ok: false, code: 'unauthorized', message: 'Registration transaction missing JSON SuccessValue' };
    }
    const verified = (successJson as { verified?: unknown }).verified;
    if (verified !== true) {
      return { ok: false, code: 'not_verified', message: 'Registration transaction did not verify on-chain' };
    }

    return { ok: true, ...(rpId ? { rpId } : {}) };
  }

  /**
   * Registration helper (no WebAuthn verification):
   * compute a threshold group key from the client's verifying share and return the relayer share
   * material. Callers should persist the relayer share only after the on-chain AddKey is confirmed.
   */
  async keygenFromClientVerifyingShareForRegistration(input: {
    nearAccountId: string;
    rpId: string;
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
      const nearAccountId = normalizeOptionalString(input.nearAccountId);
      if (!nearAccountId) {
        return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };
      }
      const rpId = normalizeOptionalString(input.rpId);
      if (!rpId) {
        return { ok: false, code: 'invalid_body', message: 'rpId is required' };
      }
      const clientVerifyingShareB64u = normalizeOptionalString(input.clientVerifyingShareB64u);
      if (!clientVerifyingShareB64u) {
        return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
      }

      let out: ThresholdEd25519KeygenWasmOutput;
      if (this.useDerivedRelayerShares()) {
        const masterSecretB64u = normalizeOptionalString(this.relayerMasterSecretB64u);
        if (!masterSecretB64u) {
          return { ok: false, code: 'missing_config', message: 'Missing THRESHOLD_ED25519_MASTER_SECRET_B64U for derived share mode' };
        }
        out = expectThresholdEd25519KeygenWasmOutput(
          threshold_ed25519_keygen_from_master_secret_and_client_verifying_share(
            masterSecretB64u,
            nearAccountId,
            rpId,
            clientVerifyingShareB64u,
          ),
        );
      } else {
        out = expectThresholdEd25519KeygenWasmOutput(
          threshold_ed25519_keygen_from_client_verifying_share(clientVerifyingShareB64u),
        );
      }

      return {
        ok: true,
        relayerKeyId: out.relayerKeyId,
        publicKey: out.publicKey,
        relayerSigningShareB64u: out.relayerSigningShareB64u,
        relayerVerifyingShareB64u: out.relayerVerifyingShareB64u,
      };
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
    if (this.useDerivedRelayerShares()) {
      // Stateless relayer mode: avoid persisting long-lived relayer signing shares.
      return;
    }
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

      if ('registrationTxHash' in request) {
        const registrationTxHash = normalizeOptionalString(request.registrationTxHash);
        if (!registrationTxHash) {
          return { ok: false, code: 'invalid_body', message: 'registrationTxHash is required' };
        }

        let outcome: FinalExecutionOutcome;
        try {
          outcome = await this.txStatus(registrationTxHash, nearAccountId);
        } catch (e: unknown) {
          const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || '');
          return { ok: false, code: 'invalid_body', message: `Failed to fetch registration transaction: ${msg || 'tx_status failed'}` };
        }

        const validTx = this.validateLinkDeviceRegistrationTx(outcome, nearAccountId);
        if (!validTx.ok) return validTx;

        await this.ensureSignerWasm();
        let out: ThresholdEd25519KeygenWasmOutput;
        if (this.useDerivedRelayerShares()) {
          const masterSecretB64u = normalizeOptionalString(this.relayerMasterSecretB64u);
          if (!masterSecretB64u) {
            return { ok: false, code: 'missing_config', message: 'Missing THRESHOLD_ED25519_MASTER_SECRET_B64U for derived share mode' };
          }
          const rpId = normalizeOptionalString(validTx.rpId);
          if (!rpId) {
            return { ok: false, code: 'invalid_body', message: 'registrationTxHash keygen requires vrf_data.rp_id in link_device_register_user args' };
          }
          out = expectThresholdEd25519KeygenWasmOutput(
            threshold_ed25519_keygen_from_master_secret_and_client_verifying_share(
              masterSecretB64u,
              nearAccountId,
              rpId,
              clientVerifyingShareB64u,
            ),
          );
        } else {
          out = expectThresholdEd25519KeygenWasmOutput(
            threshold_ed25519_keygen_from_client_verifying_share(clientVerifyingShareB64u),
          );
          await this.keyStore.put(out.relayerKeyId, {
            publicKey: out.publicKey,
            relayerSigningShareB64u: out.relayerSigningShareB64u,
            relayerVerifyingShareB64u: out.relayerVerifyingShareB64u,
          });
        }

        return {
          ok: true,
          relayerKeyId: out.relayerKeyId,
          publicKey: out.publicKey,
          relayerVerifyingShareB64u: out.relayerVerifyingShareB64u,
        };
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
      let out: ThresholdEd25519KeygenWasmOutput;
      if (this.useDerivedRelayerShares()) {
        const masterSecretB64u = normalizeOptionalString(this.relayerMasterSecretB64u);
        if (!masterSecretB64u) {
          return { ok: false, code: 'missing_config', message: 'Missing THRESHOLD_ED25519_MASTER_SECRET_B64U for derived share mode' };
        }
        out = expectThresholdEd25519KeygenWasmOutput(
          threshold_ed25519_keygen_from_master_secret_and_client_verifying_share(
            masterSecretB64u,
            nearAccountId,
            rpId,
            clientVerifyingShareB64u,
          ),
        );
      } else {
        out = expectThresholdEd25519KeygenWasmOutput(
          threshold_ed25519_keygen_from_client_verifying_share(clientVerifyingShareB64u),
        );
        await this.keyStore.put(out.relayerKeyId, {
          publicKey: out.publicKey,
          relayerSigningShareB64u: out.relayerSigningShareB64u,
          relayerVerifyingShareB64u: out.relayerVerifyingShareB64u,
        });
      }

      return {
        ok: true,
        relayerKeyId: out.relayerKeyId,
        publicKey: out.publicKey,
        relayerVerifyingShareB64u: out.relayerVerifyingShareB64u,
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

      const clientVerifyingShareB64u = normalizeOptionalString(request.clientVerifyingShareB64u);
      if (!clientVerifyingShareB64u) {
        return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
      }
      const relayerKey = await this.resolveRelayerKeyMaterial({
        relayerKeyId,
        nearAccountId: userId,
        rpId,
        clientVerifyingShareB64u,
      });
      if (!relayerKey.ok) {
        return { ok: false, code: relayerKey.code, message: relayerKey.message };
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
        clientVerifyingShareB64u,
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

  async thresholdEd25519Session(request: ThresholdEd25519SessionRequest): Promise<ThresholdEd25519SessionResponse> {
    try {
      await this.ensureReady();

      const relayerKeyId = normalizeOptionalString(request.relayerKeyId);
      if (!relayerKeyId) {
        return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };
      }
      const clientVerifyingShareB64u = normalizeOptionalString(request.clientVerifyingShareB64u);
      if (!clientVerifyingShareB64u) {
        return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
      }

      const policyRaw = request.sessionPolicy;
      if (!isObject(policyRaw)) {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy (object) is required' };
      }
      const version = normalizeOptionalString(policyRaw.version);
      if (version !== 'threshold_session_v1') {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy.version must be threshold_session_v1' };
      }
      const nearAccountId = normalizeOptionalString(policyRaw.nearAccountId);
      const rpId = normalizeOptionalString(policyRaw.rpId);
      const sessionId = normalizeOptionalString(policyRaw.sessionId);
      const policyRelayerKeyId = normalizeOptionalString(policyRaw.relayerKeyId);
      const ttlMsRaw = Number(policyRaw.ttlMs);
      const remainingUsesRaw = Number(policyRaw.remainingUses);
      if (!nearAccountId || !rpId || !sessionId || !policyRelayerKeyId) {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy{nearAccountId,rpId,relayerKeyId,sessionId} are required' };
      }
      if (policyRelayerKeyId !== relayerKeyId) {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy.relayerKeyId must match relayerKeyId' };
      }
      if (!Number.isFinite(ttlMsRaw) || ttlMsRaw <= 0) {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy.ttlMs must be a positive number' };
      }
      if (!Number.isFinite(remainingUsesRaw) || remainingUsesRaw <= 0) {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy.remainingUses must be a positive number' };
      }

      const userId = normalizeOptionalString(request.vrf_data.user_id);
      if (!userId) return { ok: false, code: 'invalid_body', message: 'vrf_data.user_id is required' };
      if (userId !== nearAccountId) {
        return { ok: false, code: 'unauthorized', message: 'sessionPolicy.nearAccountId must match vrf_data.user_id' };
      }
      const vrfRpId = normalizeOptionalString(request.vrf_data.rp_id);
      if (!vrfRpId) return { ok: false, code: 'invalid_body', message: 'vrf_data.rp_id is required' };
      if (vrfRpId !== rpId) {
        return { ok: false, code: 'unauthorized', message: 'sessionPolicy.rpId must match vrf_data.rp_id' };
      }

      const relayerKey = await this.resolveRelayerKeyMaterial({
        relayerKeyId,
        nearAccountId,
        rpId,
        clientVerifyingShareB64u,
      });
      if (!relayerKey.ok) {
        return { ok: false, code: relayerKey.code, message: relayerKey.message };
      }

      const sessionPolicyDigest32 = normalizeByteArray32((request.vrf_data as { session_policy_digest_32?: unknown }).session_policy_digest_32);
      if (!sessionPolicyDigest32) {
        return { ok: false, code: 'invalid_body', message: 'vrf_data.session_policy_digest_32 (32 bytes) is required for threshold sessions' };
      }

      const { ttlMs, remainingUses } = this.clampSessionPolicy({ ttlMs: ttlMsRaw, remainingUses: remainingUsesRaw });
      const normalizedPolicy = {
        version: 'threshold_session_v1',
        nearAccountId,
        rpId,
        relayerKeyId,
        sessionId,
        ttlMs,
        remainingUses,
      };
      const expectedPolicyDigest32 = await this.computeSessionPolicyDigest32(normalizedPolicy);
      if (!bytesEqual32(expectedPolicyDigest32, sessionPolicyDigest32)) {
        return { ok: false, code: 'session_policy_digest_mismatch', message: 'sessionPolicy does not match vrf_data.session_policy_digest_32' };
      }

      const existingSession = await this.authSessionStore.getSession(sessionId);
      if (existingSession) {
        if (existingSession.userId !== nearAccountId) {
          return { ok: false, code: 'unauthorized', message: 'threshold sessionId already exists for a different user' };
        }
        if (existingSession.relayerKeyId !== relayerKeyId) {
          return { ok: false, code: 'unauthorized', message: 'threshold sessionId already exists for a different relayerKeyId' };
        }
        if (existingSession.rpId !== rpId) {
          return { ok: false, code: 'unauthorized', message: 'threshold sessionId already exists for a different rpId' };
        }
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
      const scope = await ensureRelayerKeyIsActiveAccessKey({
        nearAccountId,
        relayerPublicKey: relayerKey.publicKey,
        viewAccessKeyList: this.viewAccessKeyList,
      });
      if (!scope.ok) {
        return { ok: false, code: scope.code, message: scope.message };
      }

      // Replay protection / idempotency: avoid resetting remainingUses/expiry if the session already exists.
      // A replayed WebAuthn assertion may re-issue a token, but should not extend the server-side session budget.
      if (existingSession) {
        return {
          ok: true,
          sessionId,
          expiresAt: new Date(existingSession.expiresAtMs).toISOString(),
        };
      }

      const expiresAtMs = Date.now() + ttlMs;
      await this.putAuthSessionRecord({
        sessionId,
        record: {
          expiresAtMs,
          relayerKeyId,
          userId: nearAccountId,
          rpId,
        },
        ttlMs,
        remainingUses,
      });

      return {
        ok: true,
        sessionId,
        expiresAt: new Date(expiresAtMs).toISOString(),
        remainingUses,
      };
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    }
  }

  async authorizeThresholdEd25519WithSession(input: {
    sessionId: string;
    userId: string;
    request: ThresholdEd25519AuthorizeWithSessionRequest;
  }): Promise<ThresholdEd25519AuthorizeResponse> {
    try {
      await this.ensureReady();
      const sessionId = normalizeOptionalString(input.sessionId);
      if (!sessionId) return { ok: false, code: 'unauthorized', message: 'Missing threshold sessionId' };
      const userId = normalizeOptionalString(input.userId);
      if (!userId) return { ok: false, code: 'unauthorized', message: 'Missing threshold userId' };

      const consumed = await this.authSessionStore.consumeUse(sessionId);
      if (!consumed.ok) {
        return { ok: false, code: consumed.code, message: consumed.message };
      }
      const sessionRecord = consumed.record;
      if (sessionRecord.userId !== userId) {
        return { ok: false, code: 'unauthorized', message: 'threshold session token does not match session record user' };
      }

      const request = input.request;
      const relayerKeyId = normalizeOptionalString(request.relayerKeyId);
      if (!relayerKeyId) return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };
      if (relayerKeyId !== sessionRecord.relayerKeyId) {
        return { ok: false, code: 'unauthorized', message: 'relayerKeyId does not match threshold session scope' };
      }

      const clientVerifyingShareB64u = normalizeOptionalString(request.clientVerifyingShareB64u);
      if (!clientVerifyingShareB64u) {
        return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
      }
      const relayerKey = await this.resolveRelayerKeyMaterial({
        relayerKeyId,
        nearAccountId: sessionRecord.userId,
        rpId: sessionRecord.rpId,
        clientVerifyingShareB64u,
      });
      if (!relayerKey.ok) {
        return { ok: false, code: relayerKey.code, message: relayerKey.message };
      }

      const purpose = normalizeOptionalString(request.purpose);
      if (!purpose) return { ok: false, code: 'invalid_body', message: 'purpose is required' };

      const signingDigest32 = normalizeByteArray32(request.signing_digest_32);
      if (!signingDigest32) {
        return { ok: false, code: 'invalid_body', message: 'signing_digest_32 (32 bytes) is required for threshold authorization' };
      }

      const signingPayload = request.signingPayload;
      const verifyPayload = await verifyThresholdEd25519AuthorizeSigningPayloadSigningDigestOnly({
        purpose,
        signingPayload,
        signingDigest32,
        userId: sessionRecord.userId,
        ensureSignerWasm: this.ensureSignerWasm,
        computeNearTxSigningDigests: threshold_ed25519_compute_near_tx_signing_digests,
        computeDelegateSigningDigest: threshold_ed25519_compute_delegate_signing_digest,
        computeNep413SigningDigest: threshold_ed25519_compute_nep413_signing_digest,
      });
      if (!verifyPayload.ok) {
        return { ok: false, code: verifyPayload.code, message: verifyPayload.message };
      }

      const expectedSigningPublicKey = extractAuthorizeSigningPublicKey(purpose, signingPayload);
      const scope = await ensureRelayerKeyIsActiveAccessKey({
        nearAccountId: sessionRecord.userId,
        relayerPublicKey: relayerKey.publicKey,
        ...(expectedSigningPublicKey ? { expectedSigningPublicKey } : {}),
        viewAccessKeyList: this.viewAccessKeyList,
      });
      if (!scope.ok) {
        return { ok: false, code: scope.code, message: scope.message };
      }

      const ttlMs = 60_000;
      const expiresAtMs = Date.now() + ttlMs;
      const mpcSessionId = this.createThresholdEd25519MpcSessionId();
      await this.sessionStore.putMpcSession(mpcSessionId, {
        expiresAtMs,
        relayerKeyId,
        purpose,
        intentDigestB64u: base64UrlEncode(verifyPayload.intentDigest32),
        signingDigestB64u: base64UrlEncode(signingDigest32),
        userId: sessionRecord.userId,
        rpId: sessionRecord.rpId,
        clientVerifyingShareB64u,
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

      const key = await this.resolveRelayerKeyMaterial({
        relayerKeyId,
        nearAccountId: sess.userId,
        rpId: sess.rpId,
        clientVerifyingShareB64u: sess.clientVerifyingShareB64u,
      });
      if (!key.ok) {
        return { ok: false, code: key.code, message: key.message };
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
      const commit = expectThresholdEd25519Round1CommitWasmOutput(
        threshold_ed25519_round1_commit(key.relayerSigningShareB64u),
      );

      const signingSessionId = this.createThresholdEd25519SigningSessionId();
      const ttlMs = 60_000;
      const expiresAtMs = Date.now() + ttlMs;
      await this.sessionStore.putSigningSession(signingSessionId, {
        expiresAtMs,
        mpcSessionId,
        relayerKeyId,
        signingDigestB64u,
        userId: sess.userId,
        rpId: sess.rpId,
        clientVerifyingShareB64u: sess.clientVerifyingShareB64u,
        clientCommitments,
        relayerCommitments: commit.relayerCommitments,
        relayerNoncesB64u: commit.relayerNoncesB64u,
      }, ttlMs);

      return {
        ok: true,
        signingSessionId,
        relayerCommitments: commit.relayerCommitments,
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

      const key = await this.resolveRelayerKeyMaterial({
        relayerKeyId: sess.relayerKeyId,
        nearAccountId: sess.userId,
        rpId: sess.rpId,
        clientVerifyingShareB64u: sess.clientVerifyingShareB64u,
      });
      if (!key.ok) {
        return { ok: false, code: key.code, message: key.message };
      }

      await this.ensureSignerWasm();
      const out = expectThresholdEd25519Round2SignWasmOutput(threshold_ed25519_round2_sign({
        relayerSigningShareB64u: key.relayerSigningShareB64u,
        relayerNoncesB64u: sess.relayerNoncesB64u,
        groupPublicKey: key.publicKey,
        signingDigestB64u: sess.signingDigestB64u,
        clientCommitments: sess.clientCommitments,
        relayerCommitments: sess.relayerCommitments,
      }));

      // signature aggregation is handled by the client coordinator.
      return { ok: true, relayerSignatureShareB64u: out.relayerSignatureShareB64u };
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    }
  }
}
