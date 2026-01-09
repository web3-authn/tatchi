import type { NormalizedLogger } from '../logger';
import { base64Decode, base64UrlEncode } from '../../../utils/encoders';
import { toOptionalTrimmedString } from '../../../utils/validation';
import type { AccessKeyList } from '../../../core/NearClient';
import type { FinalExecutionOutcome } from '@near-js/types';
import type { ThresholdEd25519KeyStore } from './stores/KeyStore';
import type {
  ThresholdEd25519SessionStore,
} from './stores/SessionStore';
import type {
  ThresholdEd25519AuthSessionStore,
  ThresholdEd25519AuthSessionRecord,
} from './stores/AuthSessionStore';
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
} from '../../../wasm_signer_worker/pkg/wasm_signer_worker.js';
import {
  bytesEqual32,
  ensureRelayerKeyIsActiveAccessKey,
  extractAuthorizeSigningPublicKey,
  isObject,
  normalizeByteArray32,
  verifyThresholdEd25519AuthorizeSigningPayloadSigningDigestOnly,
  verifyThresholdEd25519AuthorizeSigningPayload,
} from './validation';
import { alphabetizeStringify, sha256BytesUtf8 } from '../../../utils/digests';
import {
  areThresholdEd25519ParticipantIds2p,
  normalizeThresholdEd25519ParticipantIds,
} from '../../../threshold/participants';
import type { ThresholdEd25519ShareMode } from './config';
import {
  coerceThresholdEd25519ShareMode,
  coerceThresholdNodeRole,
  parseThresholdCoordinatorPeers,
  parseThresholdCoordinatorSharedSecretBytes,
  parseThresholdEd25519ParticipantIds2p,
  validateThresholdEd25519MasterSecretB64u,
} from './config';
import { ThresholdEd25519SigningHandlers } from './signingHandlers';
import { resolveThresholdEd25519RelayerKeyMaterial, shouldUseDerivedRelayerShares } from './relayerKeyMaterial';

type ParseOk<T> = { ok: true; value: T };
type ParseErr = { ok: false; code: string; message: string };
type ParseResult<T> = ParseOk<T> | ParseErr;

type ParsedThresholdEd25519KeygenRequest =
  | {
      kind: 'registration_tx';
      nearAccountId: string;
      clientVerifyingShareB64u: string;
      registrationTxHash: string;
    }
  | {
      kind: 'webauthn';
      nearAccountId: string;
      clientVerifyingShareB64u: string;
      rpId: string;
      intentDigest32: Uint8Array;
    };

function parseThresholdEd25519KeygenRequest(request: ThresholdEd25519KeygenRequest): ParseResult<ParsedThresholdEd25519KeygenRequest> {
  const rec = (request || {}) as unknown as Record<string, unknown>;
  const nearAccountId = toOptionalTrimmedString(rec.nearAccountId);
  if (!nearAccountId) {
    return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };
  }
  const clientVerifyingShareB64u = toOptionalTrimmedString(rec.clientVerifyingShareB64u);
  if (!clientVerifyingShareB64u) {
    return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
  }

  if (Object.prototype.hasOwnProperty.call(rec, 'registrationTxHash')) {
    const registrationTxHash = toOptionalTrimmedString(rec.registrationTxHash);
    if (!registrationTxHash) {
      return { ok: false, code: 'invalid_body', message: 'registrationTxHash is required' };
    }
    return { ok: true, value: { kind: 'registration_tx', nearAccountId, clientVerifyingShareB64u, registrationTxHash } };
  }

  const vrfData = (rec as { vrf_data?: any }).vrf_data;
  const vrfUserId = toOptionalTrimmedString(vrfData?.user_id);
  if (!vrfUserId) {
    return { ok: false, code: 'invalid_body', message: 'vrf_data.user_id is required' };
  }
  if (vrfUserId !== nearAccountId) {
    return { ok: false, code: 'unauthorized', message: 'nearAccountId must match vrf_data.user_id' };
  }

  const rpId = toOptionalTrimmedString(vrfData?.rp_id);
  if (!rpId) {
    return { ok: false, code: 'invalid_body', message: 'vrf_data.rp_id is required' };
  }

  const intentDigest32 = normalizeByteArray32(vrfData?.intent_digest_32);
  if (!intentDigest32) {
    return {
      ok: false,
      code: 'invalid_body',
      message: 'vrf_data.intent_digest_32 (32 bytes) is required for threshold keygen',
    };
  }

  return { ok: true, value: { kind: 'webauthn', nearAccountId, clientVerifyingShareB64u, rpId, intentDigest32 } };
}

function parseThresholdEd25519AuthorizeRequest(request: ThresholdEd25519AuthorizeRequest): ParseResult<{
  relayerKeyId: string;
  clientVerifyingShareB64u: string;
  purpose: string;
  userId: string;
  rpId: string;
  intentDigest32: Uint8Array;
  signingDigest32: Uint8Array;
  signingPayload: unknown;
}> {
  const rec = (request || {}) as unknown as Record<string, unknown>;
  const relayerKeyId = toOptionalTrimmedString(rec.relayerKeyId);
  if (!relayerKeyId) return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };

  const purpose = toOptionalTrimmedString(rec.purpose);
  if (!purpose) return { ok: false, code: 'invalid_body', message: 'purpose is required' };

  const vrfData = (rec as { vrf_data?: any }).vrf_data;
  const userId = toOptionalTrimmedString(vrfData?.user_id);
  if (!userId) return { ok: false, code: 'invalid_body', message: 'vrf_data.user_id is required' };
  const rpId = toOptionalTrimmedString(vrfData?.rp_id);
  if (!rpId) return { ok: false, code: 'invalid_body', message: 'vrf_data.rp_id is required' };

  const clientVerifyingShareB64u = toOptionalTrimmedString(rec.clientVerifyingShareB64u);
  if (!clientVerifyingShareB64u) {
    return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
  }

  const intentDigest32 = normalizeByteArray32(vrfData?.intent_digest_32);
  if (!intentDigest32) {
    return {
      ok: false,
      code: 'invalid_body',
      message: 'vrf_data.intent_digest_32 (32 bytes) is required for threshold authorization',
    };
  }

  const signingDigest32 = normalizeByteArray32(rec.signing_digest_32);
  if (!signingDigest32) {
    return {
      ok: false,
      code: 'invalid_body',
      message: 'signing_digest_32 (32 bytes) is required for threshold authorization',
    };
  }

  return {
    ok: true,
    value: {
      relayerKeyId,
      clientVerifyingShareB64u,
      purpose,
      userId,
      rpId,
      intentDigest32,
      signingDigest32,
      signingPayload: rec.signingPayload,
    },
  };
}

function parseThresholdEd25519AuthorizeWithSessionRequest(request: ThresholdEd25519AuthorizeWithSessionRequest): ParseResult<{
  relayerKeyId: string;
  clientVerifyingShareB64u: string;
  purpose: string;
  signingDigest32: Uint8Array;
  signingPayload: unknown;
}> {
  const rec = (request || {}) as unknown as Record<string, unknown>;
  const relayerKeyId = toOptionalTrimmedString(rec.relayerKeyId);
  if (!relayerKeyId) return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };
  const clientVerifyingShareB64u = toOptionalTrimmedString(rec.clientVerifyingShareB64u);
  if (!clientVerifyingShareB64u) {
    return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
  }
  const purpose = toOptionalTrimmedString(rec.purpose);
  if (!purpose) return { ok: false, code: 'invalid_body', message: 'purpose is required' };
  const signingDigest32 = normalizeByteArray32(rec.signing_digest_32);
  if (!signingDigest32) {
    return { ok: false, code: 'invalid_body', message: 'signing_digest_32 (32 bytes) is required for threshold authorization' };
  }
  return { ok: true, value: { relayerKeyId, clientVerifyingShareB64u, purpose, signingDigest32, signingPayload: rec.signingPayload } };
}

function parseThresholdEd25519SessionRequest(
  request: ThresholdEd25519SessionRequest,
  participantIds2p: number[],
): ParseResult<{
  relayerKeyId: string;
  clientVerifyingShareB64u: string;
  nearAccountId: string;
  rpId: string;
  sessionId: string;
  ttlMsRaw: number;
  remainingUsesRaw: number;
  policyParticipantIds: number[] | null;
  sessionPolicyDigest32: Uint8Array;
}> {
  const rec = (request || {}) as unknown as Record<string, unknown>;
  const relayerKeyId = toOptionalTrimmedString(rec.relayerKeyId);
  if (!relayerKeyId) {
    return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };
  }
  const clientVerifyingShareB64u = toOptionalTrimmedString(rec.clientVerifyingShareB64u);
  if (!clientVerifyingShareB64u) {
    return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
  }

  const policyRaw = (rec as { sessionPolicy?: unknown }).sessionPolicy;
  if (!isObject(policyRaw)) {
    return { ok: false, code: 'invalid_body', message: 'sessionPolicy (object) is required' };
  }
  const version = toOptionalTrimmedString((policyRaw as Record<string, unknown>).version);
  if (version !== 'threshold_session_v1') {
    return { ok: false, code: 'invalid_body', message: 'sessionPolicy.version must be threshold_session_v1' };
  }
  const nearAccountId = toOptionalTrimmedString((policyRaw as Record<string, unknown>).nearAccountId);
  const rpId = toOptionalTrimmedString((policyRaw as Record<string, unknown>).rpId);
  const sessionId = toOptionalTrimmedString((policyRaw as Record<string, unknown>).sessionId);
  const policyRelayerKeyId = toOptionalTrimmedString((policyRaw as Record<string, unknown>).relayerKeyId);
  const ttlMsRaw = Number((policyRaw as Record<string, unknown>).ttlMs);
  const remainingUsesRaw = Number((policyRaw as Record<string, unknown>).remainingUses);
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
        ? { ok: false, code: 'multi_party_not_supported', message: `multi-party threshold sessions are not supported yet (expected participantIds=[${participantIds2p.join(',')}])` }
        : { ok: false, code: 'invalid_body', message: 'sessionPolicy.participantIds must contain exactly 2 participant ids for 2-party signing' };
    }
    if (!areThresholdEd25519ParticipantIds2p(policyParticipantIds, participantIds2p)) {
      return { ok: false, code: 'unauthorized', message: `sessionPolicy.participantIds must match server signer set (expected participantIds=[${participantIds2p.join(',')}])` };
    }
  }

  if (!Number.isFinite(ttlMsRaw) || ttlMsRaw <= 0) {
    return { ok: false, code: 'invalid_body', message: 'sessionPolicy.ttlMs must be a positive number' };
  }
  if (!Number.isFinite(remainingUsesRaw) || remainingUsesRaw <= 0) {
    return { ok: false, code: 'invalid_body', message: 'sessionPolicy.remainingUses must be a positive number' };
  }

  const vrfData = (rec as { vrf_data?: any }).vrf_data;
  const userId = toOptionalTrimmedString(vrfData?.user_id);
  if (!userId) return { ok: false, code: 'invalid_body', message: 'vrf_data.user_id is required' };
  if (userId !== nearAccountId) {
    return { ok: false, code: 'unauthorized', message: 'sessionPolicy.nearAccountId must match vrf_data.user_id' };
  }
  const vrfRpId = toOptionalTrimmedString(vrfData?.rp_id);
  if (!vrfRpId) return { ok: false, code: 'invalid_body', message: 'vrf_data.rp_id is required' };
  if (vrfRpId !== rpId) {
    return { ok: false, code: 'unauthorized', message: 'sessionPolicy.rpId must match vrf_data.rp_id' };
  }

  const sessionPolicyDigest32 = normalizeByteArray32(vrfData?.session_policy_digest_32);
  if (!sessionPolicyDigest32) {
    return { ok: false, code: 'invalid_body', message: 'vrf_data.session_policy_digest_32 (32 bytes) is required for threshold sessions' };
  }

  return {
    ok: true,
    value: {
      relayerKeyId,
      clientVerifyingShareB64u,
      nearAccountId,
      rpId,
      sessionId,
      ttlMsRaw,
      remainingUsesRaw,
      policyParticipantIds: policyParticipantIds || null,
      sessionPolicyDigest32,
    },
  };
}

export class ThresholdEd25519Service {
  private readonly logger: NormalizedLogger;
  private readonly keyStore: ThresholdEd25519KeyStore;
  private readonly sessionStore: ThresholdEd25519SessionStore;
  private readonly authSessionStore: ThresholdEd25519AuthSessionStore;
  private readonly clientParticipantId: number;
  private readonly relayerParticipantId: number;
  private readonly participantIds2p: number[];
  private readonly shareMode: ThresholdEd25519ShareMode;
  private readonly relayerMasterSecretB64u: string | null;
  private readonly useDerivedRelayerShares: boolean;
  private readonly keygenStrategy: ThresholdEd25519KeygenStrategy;
  private readonly signingHandlers: ThresholdEd25519SigningHandlers;
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

    const nodeRole = coerceThresholdNodeRole(cfg.THRESHOLD_NODE_ROLE);
    const coordinatorPeers = parseThresholdCoordinatorPeers(cfg.THRESHOLD_COORDINATOR_PEERS) || [];
    const coordinatorSharedSecretBytes =
      parseThresholdCoordinatorSharedSecretBytes(cfg.THRESHOLD_COORDINATOR_SHARED_SECRET_B64U);

    const ids = parseThresholdEd25519ParticipantIds2p({
      THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID: cfg.THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID,
      THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID: cfg.THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID,
    });
    this.clientParticipantId = ids.clientParticipantId;
    this.relayerParticipantId = ids.relayerParticipantId;
    this.participantIds2p = ids.participantIds2p;

    this.shareMode = coerceThresholdEd25519ShareMode(cfg.THRESHOLD_ED25519_SHARE_MODE);
    this.relayerMasterSecretB64u = validateThresholdEd25519MasterSecretB64u(cfg.THRESHOLD_ED25519_MASTER_SECRET_B64U);
    if (this.shareMode === 'derived' && !this.relayerMasterSecretB64u) {
      throw new Error('threshold-ed25519 derived share mode requires THRESHOLD_ED25519_MASTER_SECRET_B64U');
    }
    this.useDerivedRelayerShares = shouldUseDerivedRelayerShares({
      shareMode: this.shareMode,
      relayerMasterSecretB64u: this.relayerMasterSecretB64u,
    });
    this.ensureReady = input.ensureReady;
    this.ensureSignerWasm = input.ensureSignerWasm;
    this.verifyAuthenticationResponse = input.verifyAuthenticationResponse;
    this.viewAccessKeyList = input.viewAccessKeyList;
    this.txStatus = input.txStatus;
    this.webAuthnContractId = input.webAuthnContractId;
    this.keygenStrategy = new ThresholdEd25519KeygenStrategyV1({
      useDerivedShares: this.useDerivedRelayerShares,
      relayerMasterSecretB64u: this.relayerMasterSecretB64u,
      clientParticipantId: this.clientParticipantId,
      relayerParticipantId: this.relayerParticipantId,
      ensureSignerWasm: this.ensureSignerWasm,
    });
    this.signingHandlers = new ThresholdEd25519SigningHandlers({
      logger: this.logger,
      nodeRole,
      coordinatorPeers,
      coordinatorSharedSecretBytes,
      clientParticipantId: this.clientParticipantId,
      relayerParticipantId: this.relayerParticipantId,
      participantIds2p: this.participantIds2p,
      sessionStore: this.sessionStore,
      ensureReady: this.ensureReady,
      ensureSignerWasm: this.ensureSignerWasm,
      viewAccessKeyList: this.viewAccessKeyList,
      resolveRelayerKeyMaterial: (args) => this.resolveRelayerKeyMaterial(args),
    });
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
	    return await resolveThresholdEd25519RelayerKeyMaterial({
	      ...input,
	      shareMode: this.shareMode,
	      relayerMasterSecretB64u: this.relayerMasterSecretB64u,
	      keyStore: this.keyStore,
	      keygenStrategy: this.keygenStrategy,
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
    if (this.useDerivedRelayerShares) {
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
      const parsedRequest = parseThresholdEd25519KeygenRequest(request);
      if (!parsedRequest.ok) return parsedRequest;

      await this.ensureReady();

      if (parsedRequest.value.kind === 'registration_tx') {
        const { nearAccountId, clientVerifyingShareB64u, registrationTxHash } = parsedRequest.value;

        let outcome: FinalExecutionOutcome;
        try {
          outcome = await this.txStatus(registrationTxHash, nearAccountId);
        } catch (e: unknown) {
          const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || '');
          return { ok: false, code: 'invalid_body', message: `Failed to fetch registration transaction: ${msg || 'tx_status failed'}` };
        }

        const validTx = this.validateLinkDeviceRegistrationTx(outcome, nearAccountId);
        if (!validTx.ok) return validTx;

        if (this.useDerivedRelayerShares) {
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

        if (!this.useDerivedRelayerShares) {
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
      const { nearAccountId, clientVerifyingShareB64u, rpId, intentDigest32 } = parsedRequest.value;
      const vrfData = (request as unknown as { vrf_data?: unknown }).vrf_data;
      const webauthnAuthentication = (request as unknown as { webauthn_authentication?: unknown }).webauthn_authentication;

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
        vrf_data: vrfData as any,
        webauthn_authentication: webauthnAuthentication as any,
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

      if (!this.useDerivedRelayerShares) {
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
      const parsedRequest = parseThresholdEd25519AuthorizeRequest(request);
      if (!parsedRequest.ok) return parsedRequest;
      const {
        relayerKeyId,
        clientVerifyingShareB64u,
        purpose,
        userId,
        rpId,
        intentDigest32,
        signingDigest32,
        signingPayload,
      } = parsedRequest.value;

      await this.ensureReady();

      const relayerKey = await this.resolveRelayerKeyMaterial({
        relayerKeyId,
        nearAccountId: userId,
        rpId,
        clientVerifyingShareB64u,
      });
      if (!relayerKey.ok) {
        return { ok: false, code: relayerKey.code, message: relayerKey.message };
      }
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
      const parsedRequest = parseThresholdEd25519SessionRequest(request, this.participantIds2p);
      if (!parsedRequest.ok) return parsedRequest;
      const {
        relayerKeyId,
        clientVerifyingShareB64u,
        nearAccountId,
        rpId,
        sessionId,
        ttlMsRaw,
        remainingUsesRaw,
        policyParticipantIds,
        sessionPolicyDigest32,
      } = parsedRequest.value;

      await this.ensureReady();

      const relayerKey = await this.resolveRelayerKeyMaterial({
        relayerKeyId,
        nearAccountId,
        rpId,
        clientVerifyingShareB64u,
      });
      if (!relayerKey.ok) {
        return { ok: false, code: relayerKey.code, message: relayerKey.message };
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
      const sessionId = toOptionalTrimmedString(input.sessionId);
      if (!sessionId) return { ok: false, code: 'unauthorized', message: 'Missing threshold sessionId' };
      const userId = toOptionalTrimmedString(input.userId);
      if (!userId) return { ok: false, code: 'unauthorized', message: 'Missing threshold userId' };

      const parsedRequest = parseThresholdEd25519AuthorizeWithSessionRequest(input.request);
      if (!parsedRequest.ok) return parsedRequest;
      const { relayerKeyId, clientVerifyingShareB64u, purpose, signingDigest32, signingPayload } = parsedRequest.value;

      await this.ensureReady();

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

      if (relayerKeyId !== sessionRecord.relayerKeyId) {
        return { ok: false, code: 'unauthorized', message: 'relayerKeyId does not match threshold session scope' };
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
    return await this.signingHandlers.thresholdEd25519SignInit(request);
  }

  async thresholdEd25519PeerSignInit(request: ThresholdEd25519PeerSignInitRequest): Promise<ThresholdEd25519PeerSignInitResponse> {
    return await this.signingHandlers.thresholdEd25519PeerSignInit(request);
  }

  async thresholdEd25519PeerSignFinalize(request: ThresholdEd25519PeerSignFinalizeRequest): Promise<ThresholdEd25519PeerSignFinalizeResponse> {
    return await this.signingHandlers.thresholdEd25519PeerSignFinalize(request);
  }

  async thresholdEd25519SignFinalize(request: ThresholdEd25519SignFinalizeRequest): Promise<ThresholdEd25519SignFinalizeResponse> {
    return await this.signingHandlers.thresholdEd25519SignFinalize(request);
  }
}
