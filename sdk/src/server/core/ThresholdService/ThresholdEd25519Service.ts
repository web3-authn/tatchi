import type { NormalizedLogger } from '../logger';
import { base64Decode, base64UrlDecode, base64UrlEncode } from '../../../utils/encoders';
import { toOptionalTrimmedString } from '../../../utils/validation';
import type { AccessKeyList } from '../../../core/NearClient';
import type { FinalExecutionOutcome } from '@near-js/types';
import type { ThresholdEd25519KeyStore } from './ThresholdEd25519KeyStore';
import type {
  ThresholdEd25519SessionStore,
  ThresholdEd25519MpcSessionRecord,
  ThresholdEd25519Commitments,
  ThresholdEd25519CommitmentsById,
} from './ThresholdEd25519SessionStore';
import type {
  ThresholdEd25519AuthSessionStore,
  ThresholdEd25519AuthSessionRecord,
} from './ThresholdEd25519AuthSessionStore';
import type { ThresholdEd25519KeygenStrategy } from './keygenStrategy';
import { ThresholdEd25519KeygenStrategyV1 } from './keygenStrategy';
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
  ThresholdEd25519PeerSignInitRequest,
  ThresholdEd25519PeerSignInitResponse,
  ThresholdEd25519PeerSignFinalizeRequest,
  ThresholdEd25519PeerSignFinalizeResponse,
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
  threshold_ed25519_round1_commit,
  threshold_ed25519_round2_sign,
} from '../../../wasm_signer_worker/pkg/wasm_signer_worker.js';
import {
  bytesEqual32,
  ensureRelayerKeyIsActiveAccessKey,
  extractAuthorizeSigningPublicKey,
  isObject,
  normalizeByteArray32,
  parseThresholdEd25519MpcSessionRecord,
  verifyThresholdEd25519AuthorizeSigningPayloadSigningDigestOnly,
  verifyThresholdEd25519AuthorizeSigningPayload,
} from './validation';
import { alphabetizeStringify, sha256BytesUtf8 } from '../../../utils/digests';
import {
  THRESHOLD_ED25519_2P_PARTICIPANT_IDS,
  THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID,
  THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID,
  areThresholdEd25519ParticipantIds2p,
  normalizeThresholdEd25519ParticipantId,
  normalizeThresholdEd25519ParticipantIds,
} from '../../../threshold/participants';

type ThresholdEd25519ShareMode = 'auto' | 'kv' | 'derived';

function coerceThresholdEd25519ShareMode(input: unknown): ThresholdEd25519ShareMode {
  const mode = toOptionalTrimmedString(input);
  if (mode === 'kv' || mode === 'derived' || mode === 'auto') return mode;
  return 'auto';
}

type ThresholdNodeRole = 'participant' | 'coordinator';

function coerceThresholdNodeRole(input: unknown): ThresholdNodeRole {
  const role = toOptionalTrimmedString(input);
  return role === 'participant' ? 'participant' : 'coordinator';
}

type ThresholdCoordinatorPeer = {
  id: number;
  relayerUrl: string;
};

function parseThresholdCoordinatorPeers(input: unknown): ThresholdCoordinatorPeer[] | null {
  const asJson = (raw: string): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const raw = typeof input === 'string' ? asJson(input) : input;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const out: ThresholdCoordinatorPeer[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const rec = item as Record<string, unknown>;
    const id = normalizeThresholdEd25519ParticipantId(rec.id);
    const relayerUrl = toOptionalTrimmedString(rec.relayerUrl)?.replace(/\/+$/, '');
    if (!id || !relayerUrl) return null;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, relayerUrl });
  }

  out.sort((a, b) => a.id - b.id);
  return out.length ? out : null;
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

type ThresholdEd25519CoordinatorGrantV1 = {
  v: 1;
  typ: 'threshold_ed25519_coordinator_grant_v1';
  iat: number;
  exp: number;
  mpcSessionId: string;
  peerParticipantId: number;
  mpcSession: unknown;
};

type ParsedThresholdEd25519MpcSession = NonNullable<ReturnType<typeof parseThresholdEd25519MpcSessionRecord>>;

export class ThresholdEd25519Service {
  private readonly logger: NormalizedLogger;
  private readonly keyStore: ThresholdEd25519KeyStore;
  private readonly sessionStore: ThresholdEd25519SessionStore;
  private readonly authSessionStore: ThresholdEd25519AuthSessionStore;
  private readonly nodeRole: ThresholdNodeRole;
  private readonly coordinatorPeers: ThresholdCoordinatorPeer[];
  private readonly coordinatorSharedSecretBytes: Uint8Array | null;
  private coordinatorHmacKeyPromise: Promise<CryptoKey> | null = null;
  private readonly clientParticipantId: number;
  private readonly relayerParticipantId: number;
  private readonly participantIds2p: number[];
  private readonly shareMode: ThresholdEd25519ShareMode;
  private readonly relayerMasterSecretB64u: string | null;
  private readonly keygenStrategy: ThresholdEd25519KeygenStrategy;
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

    this.nodeRole = coerceThresholdNodeRole(cfg.THRESHOLD_NODE_ROLE);
    this.coordinatorPeers = parseThresholdCoordinatorPeers(cfg.THRESHOLD_COORDINATOR_PEERS) || [];

    const coordinatorSharedSecretB64u = toOptionalTrimmedString(cfg.THRESHOLD_COORDINATOR_SHARED_SECRET_B64U);
    if (coordinatorSharedSecretB64u) {
      let decoded: Uint8Array;
      try {
        decoded = base64UrlDecode(coordinatorSharedSecretB64u);
      } catch {
        throw new Error('THRESHOLD_COORDINATOR_SHARED_SECRET_B64U must be valid base64url');
      }
      if (decoded.length !== 32) {
        throw new Error(`THRESHOLD_COORDINATOR_SHARED_SECRET_B64U must decode to 32 bytes, got ${decoded.length}`);
      }
      this.coordinatorSharedSecretBytes = decoded;
    } else {
      this.coordinatorSharedSecretBytes = null;
    }

    const clientIdRaw = cfg.THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID;
    const relayerIdRaw = cfg.THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID;
    const clientId = clientIdRaw === undefined ? null : normalizeThresholdEd25519ParticipantId(clientIdRaw);
    if (clientIdRaw !== undefined && !clientId) {
      throw new Error('THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID must be an integer in [1,65535]');
    }
    const relayerId = relayerIdRaw === undefined ? null : normalizeThresholdEd25519ParticipantId(relayerIdRaw);
    if (relayerIdRaw !== undefined && !relayerId) {
      throw new Error('THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID must be an integer in [1,65535]');
    }

    this.clientParticipantId = clientId ?? THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID;
    this.relayerParticipantId = relayerId ?? THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID;
    if (this.clientParticipantId === this.relayerParticipantId) {
      throw new Error('THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID must differ from THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID');
    }
    this.participantIds2p =
      normalizeThresholdEd25519ParticipantIds([this.clientParticipantId, this.relayerParticipantId])
      || [...THRESHOLD_ED25519_2P_PARTICIPANT_IDS];

    this.shareMode = coerceThresholdEd25519ShareMode(cfg.THRESHOLD_ED25519_SHARE_MODE);
    this.relayerMasterSecretB64u = toOptionalTrimmedString(cfg.THRESHOLD_ED25519_MASTER_SECRET_B64U);
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
    this.keygenStrategy = new ThresholdEd25519KeygenStrategyV1({
      useDerivedShares: this.useDerivedRelayerShares(),
      relayerMasterSecretB64u: this.relayerMasterSecretB64u,
      clientParticipantId: this.clientParticipantId,
      relayerParticipantId: this.relayerParticipantId,
      ensureSignerWasm: this.ensureSignerWasm,
    });
  }

  private async getCoordinatorHmacKey(): Promise<CryptoKey | null> {
    if (!this.coordinatorSharedSecretBytes) return null;
    if (!this.coordinatorHmacKeyPromise) {
      this.coordinatorHmacKeyPromise = crypto.subtle.importKey(
        'raw',
        this.coordinatorSharedSecretBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
    }
    return await this.coordinatorHmacKeyPromise;
  }

  private async signCoordinatorGrant(payload: ThresholdEd25519CoordinatorGrantV1): Promise<string | null> {
    const key = await this.getCoordinatorHmacKey();
    if (!key) return null;
    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes));
    return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(sig)}`;
  }

  private async verifyCoordinatorGrant(token: unknown): Promise<
    | { ok: true; grant: ThresholdEd25519CoordinatorGrantV1; mpcSession: ParsedThresholdEd25519MpcSession }
    | { ok: false; code: string; message: string }
  > {
    const key = await this.getCoordinatorHmacKey();
    if (!key) {
      return { ok: false, code: 'not_found', message: 'threshold-ed25519 coordinator grants are not enabled on this server' };
    }

    const raw = toOptionalTrimmedString(token);
    if (!raw) return { ok: false, code: 'unauthorized', message: 'Missing coordinatorGrant' };
    const parts = raw.split('.');
    if (parts.length !== 2) {
      return { ok: false, code: 'unauthorized', message: 'Invalid coordinatorGrant format' };
    }
    let payloadBytes: Uint8Array;
    let sigBytes: Uint8Array;
    try {
      payloadBytes = base64UrlDecode(parts[0]);
      sigBytes = base64UrlDecode(parts[1]);
    } catch {
      return { ok: false, code: 'unauthorized', message: 'Invalid coordinatorGrant encoding' };
    }
    if (sigBytes.length !== 32) {
      return { ok: false, code: 'unauthorized', message: 'Invalid coordinatorGrant signature length' };
    }

    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes));
    if (!bytesEqual32(expected, sigBytes)) {
      return { ok: false, code: 'unauthorized', message: 'Invalid coordinatorGrant signature' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as unknown;
    } catch {
      return { ok: false, code: 'unauthorized', message: 'Invalid coordinatorGrant JSON' };
    }
    if (!isObject(parsed)) {
      return { ok: false, code: 'unauthorized', message: 'Invalid coordinatorGrant payload' };
    }
    const g = parsed as Record<string, unknown>;
    if (g.typ !== 'threshold_ed25519_coordinator_grant_v1' || g.v !== 1) {
      return { ok: false, code: 'unauthorized', message: 'Invalid coordinatorGrant type' };
    }
    const iat = Number(g.iat);
    const exp = Number(g.exp);
    if (!Number.isFinite(iat) || !Number.isFinite(exp) || exp <= 0 || exp < iat) {
      return { ok: false, code: 'unauthorized', message: 'Invalid coordinatorGrant timestamps' };
    }
    const now = Math.floor(Date.now() / 1000);
    if (now >= exp) {
      return { ok: false, code: 'unauthorized', message: 'coordinatorGrant expired' };
    }

    const peerParticipantId = normalizeThresholdEd25519ParticipantId(g.peerParticipantId);
    if (!peerParticipantId) {
      return { ok: false, code: 'unauthorized', message: 'Invalid coordinatorGrant peerParticipantId' };
    }
    const mpcSessionId = toOptionalTrimmedString(g.mpcSessionId);
    if (!mpcSessionId) {
      return { ok: false, code: 'unauthorized', message: 'Invalid coordinatorGrant mpcSessionId' };
    }
    const mpcSession = parseThresholdEd25519MpcSessionRecord(g.mpcSession);
    if (!mpcSession) {
      return { ok: false, code: 'unauthorized', message: 'Invalid coordinatorGrant mpcSession payload' };
    }
    if (Date.now() > mpcSession.expiresAtMs) {
      return { ok: false, code: 'unauthorized', message: 'coordinatorGrant mpcSession expired' };
    }

    return {
      ok: true,
      grant: {
        v: 1,
        typ: 'threshold_ed25519_coordinator_grant_v1',
        iat,
        exp,
        mpcSessionId,
        peerParticipantId,
        mpcSession: g.mpcSession,
      },
      mpcSession,
    };
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
    return this.keygenStrategy.deriveRelayerKeyMaterial(input);
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
    const relayerKeyId = toOptionalTrimmedString(input.relayerKeyId);
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

    const clientVerifyingShareB64u = toOptionalTrimmedString(input.clientVerifyingShareB64u);
    if (!clientVerifyingShareB64u) {
      return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
    }
    const nearAccountId = toOptionalTrimmedString(input.nearAccountId);
    if (!nearAccountId) return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };
    const rpId = toOptionalTrimmedString(input.rpId);
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
    const signerId = toOptionalTrimmedString(tx.signer_id ?? tx.signerId);
    if (signerId && signerId !== expectedNearAccountId) {
      return { ok: false, code: 'unauthorized', message: 'Registration transaction signer_id mismatch' };
    }
    const receiverId = toOptionalTrimmedString(tx.receiver_id ?? tx.receiverId);
    if (receiverId && receiverId !== this.webAuthnContractId) {
      return { ok: false, code: 'unauthorized', message: 'Registration transaction receiver_id mismatch' };
    }

    const actions = Array.isArray(tx.actions) ? (tx.actions as unknown[]) : [];
    const fnCalls = actions
      .map((action) => (action && typeof action === 'object')
        ? ((action as Record<string, unknown>).FunctionCall ?? (action as Record<string, unknown>).function_call ?? null)
        : null)
      .filter((v): v is Record<string, unknown> => Boolean(v && typeof v === 'object'));

    const linkDeviceCall = fnCalls.find((fc) => toOptionalTrimmedString(fc.method_name ?? fc.methodName) === 'link_device_register_user');
    if (!linkDeviceCall) {
      return { ok: false, code: 'unauthorized', message: 'Registration transaction is not link_device_register_user' };
    }

    const argsB64 = toOptionalTrimmedString(linkDeviceCall.args);
    if (argsB64) {
      try {
        const argsText = new TextDecoder().decode(base64Decode(argsB64));
        const parsedArgs = JSON.parse(argsText) as unknown;
        if (parsedArgs && typeof parsedArgs === 'object') {
          const vrf = (parsedArgs as { vrf_data?: unknown }).vrf_data;
          if (vrf && typeof vrf === 'object') {
            const userId = toOptionalTrimmedString((vrf as { user_id?: unknown; userId?: unknown }).user_id ?? (vrf as { userId?: unknown }).userId);
            if (userId && userId !== expectedNearAccountId) {
              return { ok: false, code: 'unauthorized', message: 'Registration transaction vrf_data.user_id mismatch' };
            }
            rpId = toOptionalTrimmedString((vrf as { rp_id?: unknown; rpId?: unknown }).rp_id ?? (vrf as { rpId?: unknown }).rpId) || rpId;
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
        clientParticipantId: number;
        relayerParticipantId: number;
        participantIds: number[];
        relayerKeyId: string;
        publicKey: string;
        relayerSigningShareB64u: string;
        relayerVerifyingShareB64u: string;
      }
    | { ok: false; code: string; message: string }
  > {
    try {
      await this.ensureReady();
      const nearAccountId = toOptionalTrimmedString(input.nearAccountId);
      if (!nearAccountId) {
        return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };
      }
      const rpId = toOptionalTrimmedString(input.rpId);
      if (!rpId) {
        return { ok: false, code: 'invalid_body', message: 'rpId is required' };
      }
      const clientVerifyingShareB64u = toOptionalTrimmedString(input.clientVerifyingShareB64u);
      if (!clientVerifyingShareB64u) {
        return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
      }

      const keygen = await this.keygenStrategy.keygenFromClientVerifyingShare({
        nearAccountId,
        rpId,
        clientVerifyingShareB64u,
      });
      if (!keygen.ok) return keygen;
      const { keyMaterial } = keygen;

      return {
        ok: true,
        clientParticipantId: this.clientParticipantId,
        relayerParticipantId: this.relayerParticipantId,
        participantIds: [...this.participantIds2p],
        relayerKeyId: keyMaterial.relayerKeyId,
        publicKey: keyMaterial.publicKey,
        relayerSigningShareB64u: keyMaterial.relayerSigningShareB64u,
        relayerVerifyingShareB64u: keyMaterial.relayerVerifyingShareB64u,
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
    const relayerKeyId = toOptionalTrimmedString(input.relayerKeyId);
    if (!relayerKeyId) throw new Error('Missing relayerKeyId');
    await this.keyStore.put(relayerKeyId, {
      publicKey: toOptionalTrimmedString(input.publicKey),
      relayerSigningShareB64u: toOptionalTrimmedString(input.relayerSigningShareB64u),
      relayerVerifyingShareB64u: toOptionalTrimmedString(input.relayerVerifyingShareB64u),
    });
  }

  async thresholdEd25519Keygen(request: ThresholdEd25519KeygenRequest): Promise<ThresholdEd25519KeygenResponse> {
    try {
      await this.ensureReady();

      const nearAccountId = toOptionalTrimmedString(request.nearAccountId);
      if (!nearAccountId) {
        return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };
      }

      const clientVerifyingShareB64u = toOptionalTrimmedString(request.clientVerifyingShareB64u);
      if (!clientVerifyingShareB64u) {
        return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
      }

      if ('registrationTxHash' in request) {
        const registrationTxHash = toOptionalTrimmedString(request.registrationTxHash);
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

        if (this.useDerivedRelayerShares()) {
          const rpId = toOptionalTrimmedString(validTx.rpId);
          if (!rpId) {
            return { ok: false, code: 'invalid_body', message: 'registrationTxHash keygen requires vrf_data.rp_id in link_device_register_user args' };
          }
        }
        const keygen = await this.keygenStrategy.keygenFromClientVerifyingShare({
          nearAccountId,
          rpId: toOptionalTrimmedString(validTx.rpId),
          clientVerifyingShareB64u,
        });
        if (!keygen.ok) return keygen;
        const { keyMaterial } = keygen;
        const publicKey = keyMaterial.publicKey;
        const relayerKeyId = keyMaterial.relayerKeyId;

        if (!this.useDerivedRelayerShares()) {
          await this.keyStore.put(relayerKeyId, {
            publicKey,
            relayerSigningShareB64u: keyMaterial.relayerSigningShareB64u,
            relayerVerifyingShareB64u: keyMaterial.relayerVerifyingShareB64u,
          });
        }

        return {
          ok: true,
          clientParticipantId: this.clientParticipantId,
          relayerParticipantId: this.relayerParticipantId,
          participantIds: [...this.participantIds2p],
          relayerKeyId,
          publicKey,
          relayerVerifyingShareB64u: keyMaterial.relayerVerifyingShareB64u,
        };
      }

      const vrfData = request.vrf_data;
      const vrfUserId = toOptionalTrimmedString(vrfData.user_id);
      if (!vrfUserId) {
        return { ok: false, code: 'invalid_body', message: 'vrf_data.user_id is required' };
      }
      if (vrfUserId !== nearAccountId) {
        return { ok: false, code: 'unauthorized', message: 'nearAccountId must match vrf_data.user_id' };
      }

      const rpId = toOptionalTrimmedString(vrfData.rp_id);
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

      const keygen = await this.keygenStrategy.keygenFromClientVerifyingShare({
        nearAccountId,
        rpId,
        clientVerifyingShareB64u,
      });
      if (!keygen.ok) return keygen;
      const { keyMaterial } = keygen;
      const publicKey = keyMaterial.publicKey;
      const relayerKeyId = keyMaterial.relayerKeyId;

      if (!this.useDerivedRelayerShares()) {
        await this.keyStore.put(relayerKeyId, {
          publicKey,
          relayerSigningShareB64u: keyMaterial.relayerSigningShareB64u,
          relayerVerifyingShareB64u: keyMaterial.relayerVerifyingShareB64u,
        });
      }

      return {
        ok: true,
        clientParticipantId: this.clientParticipantId,
        relayerParticipantId: this.relayerParticipantId,
        participantIds: [...this.participantIds2p],
        relayerKeyId,
        publicKey,
        relayerVerifyingShareB64u: keyMaterial.relayerVerifyingShareB64u,
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

      const relayerKeyId = toOptionalTrimmedString(request.relayerKeyId);
      if (!relayerKeyId) {
        return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };
      }

      const purpose = toOptionalTrimmedString(request.purpose);
      if (!purpose) {
        return { ok: false, code: 'invalid_body', message: 'purpose is required' };
      }

      const userId = toOptionalTrimmedString(request.vrf_data.user_id);
      if (!userId) {
        return { ok: false, code: 'invalid_body', message: 'vrf_data.user_id is required' };
      }

      const rpId = toOptionalTrimmedString(request.vrf_data.rp_id);
      if (!rpId) {
        return { ok: false, code: 'invalid_body', message: 'vrf_data.rp_id is required' };
      }

      const clientVerifyingShareB64u = toOptionalTrimmedString(request.clientVerifyingShareB64u);
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
        participantIds: [...this.participantIds2p],
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

      const relayerKeyId = toOptionalTrimmedString(request.relayerKeyId);
      if (!relayerKeyId) {
        return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };
      }
      const clientVerifyingShareB64u = toOptionalTrimmedString(request.clientVerifyingShareB64u);
      if (!clientVerifyingShareB64u) {
        return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
      }

      const policyRaw = request.sessionPolicy;
      if (!isObject(policyRaw)) {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy (object) is required' };
      }
      const version = toOptionalTrimmedString(policyRaw.version);
      if (version !== 'threshold_session_v1') {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy.version must be threshold_session_v1' };
      }
      const nearAccountId = toOptionalTrimmedString(policyRaw.nearAccountId);
      const rpId = toOptionalTrimmedString(policyRaw.rpId);
      const sessionId = toOptionalTrimmedString(policyRaw.sessionId);
      const policyRelayerKeyId = toOptionalTrimmedString(policyRaw.relayerKeyId);
      const ttlMsRaw = Number(policyRaw.ttlMs);
      const remainingUsesRaw = Number(policyRaw.remainingUses);
      if (!nearAccountId || !rpId || !sessionId || !policyRelayerKeyId) {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy{nearAccountId,rpId,relayerKeyId,sessionId} are required' };
      }
      if (policyRelayerKeyId !== relayerKeyId) {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy.relayerKeyId must match relayerKeyId' };
      }
      const policyHasParticipantIds = Object.prototype.hasOwnProperty.call(policyRaw, 'participantIds');
      const policyParticipantIds = normalizeThresholdEd25519ParticipantIds((policyRaw as Record<string, unknown>).participantIds);
      if (policyHasParticipantIds && !policyParticipantIds) {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy.participantIds must be a non-empty array of positive integers' };
      }
      if (policyParticipantIds) {
        if (policyParticipantIds.length !== 2) {
          return policyParticipantIds.length > 2
            ? { ok: false, code: 'multi_party_not_supported', message: `multi-party threshold sessions are not supported yet (expected participantIds=[${this.participantIds2p.join(',')}])` }
            : { ok: false, code: 'invalid_body', message: 'sessionPolicy.participantIds must contain exactly 2 participant ids for 2-party signing' };
        }
        if (!areThresholdEd25519ParticipantIds2p(policyParticipantIds, this.participantIds2p)) {
          return { ok: false, code: 'unauthorized', message: `sessionPolicy.participantIds must match server signer set (expected participantIds=[${this.participantIds2p.join(',')}])` };
        }
      }
      if (!Number.isFinite(ttlMsRaw) || ttlMsRaw <= 0) {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy.ttlMs must be a positive number' };
      }
      if (!Number.isFinite(remainingUsesRaw) || remainingUsesRaw <= 0) {
        return { ok: false, code: 'invalid_body', message: 'sessionPolicy.remainingUses must be a positive number' };
      }

      const userId = toOptionalTrimmedString(request.vrf_data.user_id);
      if (!userId) return { ok: false, code: 'invalid_body', message: 'vrf_data.user_id is required' };
      if (userId !== nearAccountId) {
        return { ok: false, code: 'unauthorized', message: 'sessionPolicy.nearAccountId must match vrf_data.user_id' };
      }
      const vrfRpId = toOptionalTrimmedString(request.vrf_data.rp_id);
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
      const participantIds = policyParticipantIds || [...this.participantIds2p];
      const normalizedPolicy = {
        version: 'threshold_session_v1',
        nearAccountId,
        rpId,
        relayerKeyId,
        sessionId,
        ...(policyParticipantIds ? { participantIds: policyParticipantIds } : {}),
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
        const sameParticipantIds = existingSession.participantIds.length === participantIds.length
          && existingSession.participantIds.every((id, i) => id === participantIds[i]);
        if (!sameParticipantIds) {
          return { ok: false, code: 'unauthorized', message: 'threshold sessionId already exists for a different participant set' };
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
          participantIds,
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
      const sessionId = toOptionalTrimmedString(input.sessionId);
      if (!sessionId) return { ok: false, code: 'unauthorized', message: 'Missing threshold sessionId' };
      const userId = toOptionalTrimmedString(input.userId);
      if (!userId) return { ok: false, code: 'unauthorized', message: 'Missing threshold userId' };

      const consumed = await this.authSessionStore.consumeUse(sessionId);
      if (!consumed.ok) {
        return { ok: false, code: consumed.code, message: consumed.message };
      }
      const sessionRecord = consumed.record;
      if (sessionRecord.userId !== userId) {
        return { ok: false, code: 'unauthorized', message: 'threshold session token does not match session record user' };
      }
      const sessionParticipantIds =
        normalizeThresholdEd25519ParticipantIds(sessionRecord.participantIds) || [...this.participantIds2p];
      if (sessionParticipantIds.length !== 2) {
        return { ok: false, code: 'multi_party_not_supported', message: `multi-party threshold signing is not supported yet (expected participantIds=[${this.participantIds2p.join(',')}])` };
      }
      if (!areThresholdEd25519ParticipantIds2p(sessionParticipantIds, this.participantIds2p)) {
        return { ok: false, code: 'unauthorized', message: `threshold session token does not match server signer set (expected participantIds=[${this.participantIds2p.join(',')}])` };
      }

      const request = input.request;
      const relayerKeyId = toOptionalTrimmedString(request.relayerKeyId);
      if (!relayerKeyId) return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };
      if (relayerKeyId !== sessionRecord.relayerKeyId) {
        return { ok: false, code: 'unauthorized', message: 'relayerKeyId does not match threshold session scope' };
      }

      const clientVerifyingShareB64u = toOptionalTrimmedString(request.clientVerifyingShareB64u);
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

      const purpose = toOptionalTrimmedString(request.purpose);
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
        participantIds: [...sessionRecord.participantIds],
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
    if (this.nodeRole !== 'coordinator') {
      return {
        ok: false,
        code: 'not_found',
        message: 'threshold-ed25519 signing endpoints are not enabled on this server (set THRESHOLD_NODE_ROLE=coordinator)',
      };
    }
    try {
      await this.ensureReady();
      const mpcSessionId = toOptionalTrimmedString(request.mpcSessionId);
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
      const participantIds =
        normalizeThresholdEd25519ParticipantIds(sess.participantIds) || [...this.participantIds2p];
      if (participantIds.length !== 2) {
        return { ok: false, code: 'multi_party_not_supported', message: `multi-party threshold signing is not supported yet (expected participantIds=[${this.participantIds2p.join(',')}])` };
      }
      if (!areThresholdEd25519ParticipantIds2p(participantIds, this.participantIds2p)) {
        return { ok: false, code: 'unauthorized', message: `mpcSessionId does not match server signer set (expected participantIds=[${this.participantIds2p.join(',')}])` };
      }

      const relayerKeyId = toOptionalTrimmedString(request.relayerKeyId);
      if (!relayerKeyId) {
        return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };
      }
      if (relayerKeyId !== sess.relayerKeyId) {
        return { ok: false, code: 'unauthorized', message: 'relayerKeyId does not match mpcSessionId scope' };
      }

      const nearAccountId = toOptionalTrimmedString(request.nearAccountId);
      if (!nearAccountId) {
        return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };
      }
      if (nearAccountId !== sess.userId) {
        return { ok: false, code: 'unauthorized', message: 'nearAccountId does not match mpcSessionId scope' };
      }

      const signingDigestB64u = toOptionalTrimmedString(request.signingDigestB64u);
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
        hiding: toOptionalTrimmedString(request.clientCommitments?.hiding),
        binding: toOptionalTrimmedString(request.clientCommitments?.binding),
      };
      if (!clientCommitments.hiding || !clientCommitments.binding) {
        return { ok: false, code: 'invalid_body', message: 'clientCommitments{hiding,binding} are required' };
      }

      // No peer config: act as a single relayer participant (2P).
      if (!this.coordinatorPeers.length) {
        const out = await this.peerSignInitFromMpcSessionRecord({ mpcSessionId, mpcSession: sess, clientCommitments });
        if (!out.ok) return { ok: false, code: out.code, message: out.message };

        const signingSessionId = toOptionalTrimmedString(out.signingSessionId);
        const relayerCommitments = out.relayerCommitments;
        const relayerVerifyingShareB64u = toOptionalTrimmedString(out.relayerVerifyingShareB64u);
        if (!signingSessionId || !relayerCommitments?.hiding || !relayerCommitments?.binding || !relayerVerifyingShareB64u) {
          return { ok: false, code: 'internal', message: 'threshold-ed25519 sign/init produced incomplete output' };
        }

        return {
          ok: true,
          signingSessionId,
          commitmentsById: {
            [String(this.clientParticipantId)]: clientCommitments,
            [String(this.relayerParticipantId)]: relayerCommitments,
          },
          relayerVerifyingSharesById: {
            [String(this.relayerParticipantId)]: relayerVerifyingShareB64u,
          },
          participantIds: [...participantIds],
        };
      }

      const relayerIds = participantIds.filter((id) => id !== this.clientParticipantId);
      if (relayerIds.length !== 1) {
        return { ok: false, code: 'multi_party_not_supported', message: 'multi-party coordinator fanout is not supported yet' };
      }
      const [peerId] = relayerIds;

      const peer = this.coordinatorPeers.find((p) => p.id === peerId) || null;
      if (!peer) {
        return { ok: false, code: 'missing_config', message: `Missing coordinator peer for participant id=${peerId}` };
      }
      if (this.coordinatorPeers.some((p) => p.id !== peerId)) {
        return { ok: false, code: 'multi_party_not_supported', message: 'coordinatorPeers contains multiple participant ids (multi-party not supported yet)' };
      }

      const now = Math.floor(Date.now() / 1000);
      const exp = now + 60;
      const grant = await this.signCoordinatorGrant({
        v: 1,
        typ: 'threshold_ed25519_coordinator_grant_v1',
        iat: now,
        exp,
        mpcSessionId,
        peerParticipantId: peerId,
        mpcSession: sess,
      });
      if (!grant) {
        return { ok: false, code: 'missing_config', message: 'THRESHOLD_COORDINATOR_SHARED_SECRET_B64U is required for coordinator peer fanout' };
      }

      const initUrl = `${peer.relayerUrl}/threshold-ed25519/internal/sign/init`;
      const peerInit = await this.postJsonWithTimeout(initUrl, {
        coordinatorGrant: grant,
        clientCommitments,
      }, 10_000);
      if (!peerInit.ok) return peerInit;

      const initJson = peerInit.json as ThresholdEd25519PeerSignInitResponse;
      if (!initJson?.ok) {
        return { ok: false, code: initJson?.code || 'internal', message: initJson?.message || 'peer sign/init failed' };
      }
      const peerSigningSessionId = toOptionalTrimmedString(initJson.signingSessionId);
      const relayerCommitments = initJson.relayerCommitments;
      const relayerVerifyingShareB64u = toOptionalTrimmedString(initJson.relayerVerifyingShareB64u);
      if (!peerSigningSessionId || !relayerCommitments?.hiding || !relayerCommitments?.binding || !relayerVerifyingShareB64u) {
        return { ok: false, code: 'internal', message: 'peer sign/init produced incomplete output' };
      }

      const signingSessionId = this.createThresholdEd25519SigningSessionId();
      const ttlMs = 60_000;
      const expiresAtMs = Date.now() + ttlMs;
      const commitmentsById: Record<string, { hiding: string; binding: string }> = {
        [String(this.clientParticipantId)]: clientCommitments,
        [String(peerId)]: relayerCommitments,
      };
      const relayerVerifyingSharesById: Record<string, string> = {
        [String(peerId)]: relayerVerifyingShareB64u,
      };

      await this.sessionStore.putCoordinatorSigningSession(signingSessionId, {
        expiresAtMs,
        mpcSessionId,
        relayerKeyId,
        signingDigestB64u,
        userId: sess.userId,
        rpId: sess.rpId,
        clientVerifyingShareB64u: sess.clientVerifyingShareB64u,
        commitmentsById,
        participantIds,
        peerSigningSessionIdsById: {
          [String(peerId)]: peerSigningSessionId,
        },
        peerRelayerUrlsById: {
          [String(peerId)]: peer.relayerUrl,
        },
        peerCoordinatorGrantsById: {
          [String(peerId)]: grant,
        },
        relayerVerifyingSharesById,
      }, ttlMs);

      return {
        ok: true,
        signingSessionId,
        commitmentsById,
        relayerVerifyingSharesById,
        participantIds: [...participantIds],
      };
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    }
  }

  async thresholdEd25519PeerSignInit(request: ThresholdEd25519PeerSignInitRequest): Promise<ThresholdEd25519PeerSignInitResponse> {
    try {
      await this.ensureReady();
      const verified = await this.verifyCoordinatorGrant(request.coordinatorGrant);
      if (!verified.ok) {
        return { ok: false, code: verified.code, message: verified.message };
      }
      const { grant, mpcSession } = verified;

      if (grant.peerParticipantId !== this.relayerParticipantId) {
        return { ok: false, code: 'unauthorized', message: 'coordinatorGrant does not match this relayer participant id' };
      }

      const participantIds =
        normalizeThresholdEd25519ParticipantIds(mpcSession.participantIds) || [...this.participantIds2p];
      if (participantIds.length !== 2) {
        return { ok: false, code: 'multi_party_not_supported', message: `multi-party threshold signing is not supported yet (expected participantIds=[${this.participantIds2p.join(',')}])` };
      }
      if (!areThresholdEd25519ParticipantIds2p(participantIds, this.participantIds2p)) {
        return { ok: false, code: 'unauthorized', message: `coordinatorGrant does not match server signer set (expected participantIds=[${this.participantIds2p.join(',')}])` };
      }

      const clientCommitments: ThresholdEd25519Commitments = {
        hiding: toOptionalTrimmedString(request.clientCommitments?.hiding),
        binding: toOptionalTrimmedString(request.clientCommitments?.binding),
      };
      if (!clientCommitments.hiding || !clientCommitments.binding) {
        return { ok: false, code: 'invalid_body', message: 'clientCommitments{hiding,binding} are required' };
      }

      return await this.peerSignInitFromMpcSessionRecord({
        mpcSessionId: grant.mpcSessionId,
        mpcSession,
        clientCommitments,
      });
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    }
  }

  async thresholdEd25519PeerSignFinalize(request: ThresholdEd25519PeerSignFinalizeRequest): Promise<ThresholdEd25519PeerSignFinalizeResponse> {
    try {
      await this.ensureReady();
      const signingSessionId = toOptionalTrimmedString(request.signingSessionId);
      if (!signingSessionId) {
        return { ok: false, code: 'invalid_body', message: 'signingSessionId is required' };
      }
      const clientSignatureShareB64u = toOptionalTrimmedString(request.clientSignatureShareB64u);
      if (!clientSignatureShareB64u) {
        return { ok: false, code: 'invalid_body', message: 'clientSignatureShareB64u is required' };
      }

      const verified = await this.verifyCoordinatorGrant(request.coordinatorGrant);
      if (!verified.ok) {
        return { ok: false, code: verified.code, message: verified.message };
      }
      const { grant, mpcSession } = verified;

      if (grant.peerParticipantId !== this.relayerParticipantId) {
        return { ok: false, code: 'unauthorized', message: 'coordinatorGrant does not match this relayer participant id' };
      }

      const participantIds =
        normalizeThresholdEd25519ParticipantIds(mpcSession.participantIds) || [...this.participantIds2p];
      if (participantIds.length !== 2) {
        return { ok: false, code: 'multi_party_not_supported', message: `multi-party threshold signing is not supported yet (expected participantIds=[${this.participantIds2p.join(',')}])` };
      }
      if (!areThresholdEd25519ParticipantIds2p(participantIds, this.participantIds2p)) {
        return { ok: false, code: 'unauthorized', message: `coordinatorGrant does not match server signer set (expected participantIds=[${this.participantIds2p.join(',')}])` };
      }

      return await this.peerSignFinalizeFromSigningSessionId({
        signingSessionId,
        clientSignatureShareB64u,
        expectedMpcSessionId: grant.mpcSessionId,
        expectedRelayerKeyId: mpcSession.relayerKeyId,
        expectedSigningDigestB64u: mpcSession.signingDigestB64u,
        expectedUserId: mpcSession.userId,
        expectedRpId: mpcSession.rpId,
        expectedClientVerifyingShareB64u: mpcSession.clientVerifyingShareB64u,
      });
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    }
  }

  private async peerSignInitFromMpcSessionRecord(input: {
    mpcSessionId: string;
    mpcSession: ThresholdEd25519MpcSessionRecord;
    clientCommitments: ThresholdEd25519Commitments;
  }): Promise<ThresholdEd25519PeerSignInitResponse> {
    const mpcSessionId = toOptionalTrimmedString(input.mpcSessionId);
    if (!mpcSessionId) {
      return { ok: false, code: 'invalid_body', message: 'mpcSessionId is required' };
    }
    const sess = input.mpcSession;
    if (Date.now() > sess.expiresAtMs) {
      return { ok: false, code: 'unauthorized', message: 'mpcSessionId expired' };
    }

    const participantIds =
      normalizeThresholdEd25519ParticipantIds(sess.participantIds) || [...this.participantIds2p];
    if (participantIds.length !== 2) {
      return { ok: false, code: 'multi_party_not_supported', message: `multi-party threshold signing is not supported yet (expected participantIds=[${this.participantIds2p.join(',')}])` };
    }
    if (!areThresholdEd25519ParticipantIds2p(participantIds, this.participantIds2p)) {
      return { ok: false, code: 'unauthorized', message: `mpcSessionId does not match server signer set (expected participantIds=[${this.participantIds2p.join(',')}])` };
    }

    const signingDigestB64u = toOptionalTrimmedString(sess.signingDigestB64u);
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

    const key = await this.resolveRelayerKeyMaterial({
      relayerKeyId: sess.relayerKeyId,
      nearAccountId: sess.userId,
      rpId: sess.rpId,
      clientVerifyingShareB64u: sess.clientVerifyingShareB64u,
    });
    if (!key.ok) {
      return { ok: false, code: key.code, message: key.message };
    }

    // Tighten scope: ensure relayerKeyId public key is actually an access key on nearAccountId.
    const scope = await ensureRelayerKeyIsActiveAccessKey({
      nearAccountId: sess.userId,
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
    const commitmentsById: ThresholdEd25519CommitmentsById = {
      [String(this.clientParticipantId)]: input.clientCommitments,
      [String(this.relayerParticipantId)]: commit.relayerCommitments,
    };
    await this.sessionStore.putSigningSession(signingSessionId, {
      expiresAtMs,
      mpcSessionId,
      relayerKeyId: sess.relayerKeyId,
      signingDigestB64u,
      userId: sess.userId,
      rpId: sess.rpId,
      clientVerifyingShareB64u: sess.clientVerifyingShareB64u,
      clientCommitments: input.clientCommitments,
      relayerCommitments: commit.relayerCommitments,
      commitmentsById,
      relayerNoncesB64u: commit.relayerNoncesB64u,
      participantIds,
    }, ttlMs);

    return {
      ok: true,
      signingSessionId,
      relayerCommitments: commit.relayerCommitments,
      relayerVerifyingShareB64u: key.relayerVerifyingShareB64u,
    };
  }

  private async peerSignFinalizeFromSigningSessionId(input: {
    signingSessionId: string;
    clientSignatureShareB64u: string;
    expectedMpcSessionId?: string;
    expectedRelayerKeyId?: string;
    expectedSigningDigestB64u?: string;
    expectedUserId?: string;
    expectedRpId?: string;
    expectedClientVerifyingShareB64u?: string;
  }): Promise<ThresholdEd25519PeerSignFinalizeResponse> {
    const signingSessionId = toOptionalTrimmedString(input.signingSessionId);
    if (!signingSessionId) {
      return { ok: false, code: 'invalid_body', message: 'signingSessionId is required' };
    }
    const clientSignatureShareB64u = toOptionalTrimmedString(input.clientSignatureShareB64u);
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

    const restoreOnMismatch = async (): Promise<void> => {
      const ttlMs = Math.max(0, sess.expiresAtMs - Date.now());
      if (!ttlMs) return;
      await this.sessionStore.putSigningSession(signingSessionId, sess, ttlMs);
    };

    const expectedMpcSessionId = toOptionalTrimmedString(input.expectedMpcSessionId);
    if (expectedMpcSessionId && sess.mpcSessionId !== expectedMpcSessionId) {
      await restoreOnMismatch();
      return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
    }
    const expectedRelayerKeyId = toOptionalTrimmedString(input.expectedRelayerKeyId);
    if (expectedRelayerKeyId && sess.relayerKeyId !== expectedRelayerKeyId) {
      await restoreOnMismatch();
      return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
    }
    const expectedSigningDigestB64u = toOptionalTrimmedString(input.expectedSigningDigestB64u);
    if (expectedSigningDigestB64u && sess.signingDigestB64u !== expectedSigningDigestB64u) {
      await restoreOnMismatch();
      return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
    }
    const expectedUserId = toOptionalTrimmedString(input.expectedUserId);
    if (expectedUserId && sess.userId !== expectedUserId) {
      await restoreOnMismatch();
      return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
    }
    const expectedRpId = toOptionalTrimmedString(input.expectedRpId);
    if (expectedRpId && sess.rpId !== expectedRpId) {
      await restoreOnMismatch();
      return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
    }
    const expectedClientVerifyingShareB64u = toOptionalTrimmedString(input.expectedClientVerifyingShareB64u);
    if (expectedClientVerifyingShareB64u && sess.clientVerifyingShareB64u !== expectedClientVerifyingShareB64u) {
      await restoreOnMismatch();
      return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
    }

    const participantIds =
      normalizeThresholdEd25519ParticipantIds(sess.participantIds) || [...this.participantIds2p];
    if (participantIds.length !== 2) {
      return { ok: false, code: 'multi_party_not_supported', message: `multi-party threshold signing is not supported yet (expected participantIds=[${this.participantIds2p.join(',')}])` };
    }
    if (!areThresholdEd25519ParticipantIds2p(participantIds, this.participantIds2p)) {
      return { ok: false, code: 'unauthorized', message: `signingSessionId does not match server signer set (expected participantIds=[${this.participantIds2p.join(',')}])` };
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
    const clientCommitments = sess.commitmentsById?.[String(this.clientParticipantId)]
      || sess.clientCommitments;
    const relayerCommitments = sess.commitmentsById?.[String(this.relayerParticipantId)]
      || sess.relayerCommitments;
    const out = expectThresholdEd25519Round2SignWasmOutput(threshold_ed25519_round2_sign({
      clientParticipantId: this.clientParticipantId,
      relayerParticipantId: this.relayerParticipantId,
      relayerSigningShareB64u: key.relayerSigningShareB64u,
      relayerNoncesB64u: sess.relayerNoncesB64u,
      groupPublicKey: key.publicKey,
      signingDigestB64u: sess.signingDigestB64u,
      clientCommitments,
      relayerCommitments,
    }));

    return { ok: true, relayerSignatureShareB64u: out.relayerSignatureShareB64u };
  }

  async thresholdEd25519SignFinalize(request: ThresholdEd25519SignFinalizeRequest): Promise<ThresholdEd25519SignFinalizeResponse> {
    if (this.nodeRole !== 'coordinator') {
      return {
        ok: false,
        code: 'not_found',
        message: 'threshold-ed25519 signing endpoints are not enabled on this server (set THRESHOLD_NODE_ROLE=coordinator)',
      };
    }
    try {
      await this.ensureReady();
      const signingSessionId = toOptionalTrimmedString(request.signingSessionId);
      if (!signingSessionId) {
        return { ok: false, code: 'invalid_body', message: 'signingSessionId is required' };
      }
      const clientSignatureShareB64u = toOptionalTrimmedString(request.clientSignatureShareB64u);
      if (!clientSignatureShareB64u) {
        return { ok: false, code: 'invalid_body', message: 'clientSignatureShareB64u is required' };
      }

      // No peer config: act as a single relayer participant (2P).
      if (!this.coordinatorPeers.length) {
        const out = await this.peerSignFinalizeFromSigningSessionId({ signingSessionId, clientSignatureShareB64u });
        if (!out.ok) return { ok: false, code: out.code, message: out.message };
        const relayerSignatureShareB64u = toOptionalTrimmedString(out.relayerSignatureShareB64u);
        if (!relayerSignatureShareB64u) {
          return { ok: false, code: 'internal', message: 'threshold-ed25519 sign/finalize produced empty signature share' };
        }
        return {
          ok: true,
          relayerSignatureSharesById: {
            [String(this.relayerParticipantId)]: relayerSignatureShareB64u,
          },
        };
      }

      const sess = await this.sessionStore.takeCoordinatorSigningSession(signingSessionId);
      if (!sess) {
        return { ok: false, code: 'unauthorized', message: 'signingSessionId expired or invalid' };
      }
      if (Date.now() > sess.expiresAtMs) {
        return { ok: false, code: 'unauthorized', message: 'signingSessionId expired' };
      }

      const participantIds =
        normalizeThresholdEd25519ParticipantIds(sess.participantIds) || [...this.participantIds2p];
      if (participantIds.length !== 2) {
        return { ok: false, code: 'multi_party_not_supported', message: 'multi-party coordinator fanout is not supported yet' };
      }
      if (!areThresholdEd25519ParticipantIds2p(participantIds, this.participantIds2p)) {
        return { ok: false, code: 'unauthorized', message: `signingSessionId does not match server signer set (expected participantIds=[${this.participantIds2p.join(',')}])` };
      }

      const relayerIds = participantIds.filter((id) => id !== this.clientParticipantId);
      if (relayerIds.length !== 1) {
        return { ok: false, code: 'multi_party_not_supported', message: 'multi-party coordinator fanout is not supported yet' };
      }
      const [peerId] = relayerIds;

      const peerSigningSessionId = toOptionalTrimmedString(sess.peerSigningSessionIdsById?.[String(peerId)]);
      const peerRelayerUrl = toOptionalTrimmedString(sess.peerRelayerUrlsById?.[String(peerId)]);
      const peerCoordinatorGrant = toOptionalTrimmedString(sess.peerCoordinatorGrantsById?.[String(peerId)]);
      if (!peerSigningSessionId || !peerRelayerUrl || !peerCoordinatorGrant) {
        return { ok: false, code: 'internal', message: 'coordinator signing session missing peer mapping' };
      }

      const finalizeUrl = `${peerRelayerUrl}/threshold-ed25519/internal/sign/finalize`;
      const peerFinalize = await this.postJsonWithTimeout(finalizeUrl, {
        coordinatorGrant: peerCoordinatorGrant,
        signingSessionId: peerSigningSessionId,
        clientSignatureShareB64u,
      }, 10_000);
      if (!peerFinalize.ok) return peerFinalize;

      const finalizeJson = peerFinalize.json as ThresholdEd25519PeerSignFinalizeResponse;
      if (!finalizeJson?.ok) {
        return { ok: false, code: finalizeJson?.code || 'internal', message: finalizeJson?.message || 'peer sign/finalize failed' };
      }
      const relayerSignatureShareB64u = toOptionalTrimmedString(finalizeJson.relayerSignatureShareB64u);
      if (!relayerSignatureShareB64u) {
        return { ok: false, code: 'internal', message: 'peer sign/finalize produced empty signature share' };
      }

      return {
        ok: true,
        relayerSignatureSharesById: {
          [String(peerId)]: relayerSignatureShareB64u,
        },
      };
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    }
  }

  private async postJsonWithTimeout(
    url: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<
    | { ok: true; status: number; json: any }
    | { ok: false; code: string; message: string }
  > {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const id = controller ? setTimeout(() => controller.abort(), Math.max(0, Number(timeoutMs) || 0)) : undefined;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        signal: controller?.signal,
      } as RequestInit);
      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }
      return { ok: true, status: res.status, json };
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Network error');
      return { ok: false, code: 'internal', message: msg };
    } finally {
      if (id !== undefined) clearTimeout(id);
    }
  }
}
