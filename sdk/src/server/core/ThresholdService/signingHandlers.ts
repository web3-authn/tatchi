import type { AccessKeyList } from '../../../core/NearClient';
import { toOptionalTrimmedString } from '../../../utils/validation';
import type { NormalizedLogger } from '../logger';
import type {
  ThresholdEd25519PeerSignFinalizeRequest,
  ThresholdEd25519PeerSignFinalizeResponse,
  ThresholdEd25519PeerSignInitRequest,
  ThresholdEd25519PeerSignInitResponse,
  ThresholdEd25519SignFinalizeRequest,
  ThresholdEd25519SignFinalizeResponse,
  ThresholdEd25519SignInitRequest,
  ThresholdEd25519SignInitResponse,
} from '../types';
import {
  threshold_ed25519_round1_commit,
  threshold_ed25519_round2_sign,
} from '../../../wasm_signer_worker/pkg/wasm_signer_worker.js';
import { ensureRelayerKeyIsActiveAccessKey } from './validation';
import type {
  ThresholdEd25519Commitments,
  ThresholdEd25519CommitmentsById,
  ThresholdEd25519MpcSessionRecord,
  ThresholdEd25519SessionStore,
} from './stores/SessionStore';
import {
  areThresholdEd25519ParticipantIds2p,
  normalizeThresholdEd25519ParticipantIds,
} from '../../../threshold/participants';
import type { ThresholdCoordinatorPeer, ThresholdNodeRole } from './config';
import type { ParsedThresholdEd25519MpcSession, ThresholdEd25519CoordinatorGrantV1 } from './coordinatorGrant';
import {
  signThresholdEd25519CoordinatorGrantV1,
  verifyThresholdEd25519CoordinatorGrantV1,
} from './coordinatorGrant';

type ParseOk<T> = { ok: true; value: T };
type ParseErr = { ok: false; code: string; message: string };
type ParseResult<T> = ParseOk<T> | ParseErr;

type PeerSignInitOk = {
  ok: true;
  signingSessionId: string;
  relayerCommitments: ThresholdEd25519Commitments;
  relayerVerifyingShareB64u: string;
};
type PeerSignInitResult = PeerSignInitOk | ParseErr;

type PeerSignFinalizeOk = { ok: true; relayerSignatureShareB64u: string };
type PeerSignFinalizeResult = PeerSignFinalizeOk | ParseErr;

function parseClientCommitments(input: unknown): ParseResult<ThresholdEd25519Commitments> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, code: 'invalid_body', message: 'clientCommitments{hiding,binding} are required' };
  }
  const rec = input as Record<string, unknown>;
  const hiding = toOptionalTrimmedString(rec.hiding);
  const binding = toOptionalTrimmedString(rec.binding);
  if (!hiding || !binding) {
    return { ok: false, code: 'invalid_body', message: 'clientCommitments{hiding,binding} are required' };
  }
  return { ok: true, value: { hiding, binding } };
}

function parseThresholdEd25519SignInitRequest(request: ThresholdEd25519SignInitRequest): ParseResult<{
  mpcSessionId: string;
  relayerKeyId: string;
  nearAccountId: string;
  signingDigestB64u: string;
  clientCommitments: ThresholdEd25519Commitments;
}> {
  const mpcSessionId = toOptionalTrimmedString(request.mpcSessionId);
  if (!mpcSessionId) return { ok: false, code: 'invalid_body', message: 'mpcSessionId is required' };

  const relayerKeyId = toOptionalTrimmedString(request.relayerKeyId);
  if (!relayerKeyId) return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };

  const nearAccountId = toOptionalTrimmedString(request.nearAccountId);
  if (!nearAccountId) return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };

  const signingDigestB64u = toOptionalTrimmedString(request.signingDigestB64u);
  if (!signingDigestB64u) return { ok: false, code: 'invalid_body', message: 'signingDigestB64u is required' };

  const commitments = parseClientCommitments((request as unknown as { clientCommitments?: unknown }).clientCommitments);
  if (!commitments.ok) return commitments;

  return {
    ok: true,
    value: {
      mpcSessionId,
      relayerKeyId,
      nearAccountId,
      signingDigestB64u,
      clientCommitments: commitments.value,
    },
  };
}

function parseThresholdEd25519FinalizeRequest(request: {
  signingSessionId: unknown;
  clientSignatureShareB64u: unknown;
}): ParseResult<{
  signingSessionId: string;
  clientSignatureShareB64u: string;
}> {
  const signingSessionId = toOptionalTrimmedString(request.signingSessionId);
  if (!signingSessionId) return { ok: false, code: 'invalid_body', message: 'signingSessionId is required' };
  const clientSignatureShareB64u = toOptionalTrimmedString(request.clientSignatureShareB64u);
  if (!clientSignatureShareB64u) {
    return { ok: false, code: 'invalid_body', message: 'clientSignatureShareB64u is required' };
  }
  return { ok: true, value: { signingSessionId, clientSignatureShareB64u } };
}

function require2pParticipantIds(raw: unknown, expected2p: number[], label: string): ParseResult<number[]> {
  const participantIds = normalizeThresholdEd25519ParticipantIds(raw) || [...expected2p];
  if (participantIds.length !== 2) {
    return {
      ok: false,
      code: 'multi_party_not_supported',
      message: `multi-party threshold signing is not supported yet (expected participantIds=[${expected2p.join(',')}])`,
    };
  }
  if (!areThresholdEd25519ParticipantIds2p(participantIds, expected2p)) {
    return {
      ok: false,
      code: 'unauthorized',
      message: `${label} does not match server signer set (expected participantIds=[${expected2p.join(',')}])`,
    };
  }
  return { ok: true, value: participantIds };
}

type ResolveRelayerKeyMaterialFn = (input: {
  relayerKeyId: string;
  nearAccountId: string;
  rpId: string;
  clientVerifyingShareB64u: string;
}) => Promise<
  | { ok: true; publicKey: string; relayerSigningShareB64u: string; relayerVerifyingShareB64u: string }
  | { ok: false; code: string; message: string }
>;

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

export class ThresholdEd25519SigningHandlers {
  private readonly logger: NormalizedLogger;
  private readonly nodeRole: ThresholdNodeRole;
  private readonly coordinatorPeers: ThresholdCoordinatorPeer[];
  private readonly coordinatorSharedSecretBytes: Uint8Array | null;
  private coordinatorHmacKeyPromise: Promise<CryptoKey> | null = null;
  private readonly clientParticipantId: number;
  private readonly relayerParticipantId: number;
  private readonly participantIds2p: number[];
  private readonly sessionStore: ThresholdEd25519SessionStore;
  private readonly ensureReady: () => Promise<void>;
  private readonly ensureSignerWasm: () => Promise<void>;
  private readonly viewAccessKeyList: (accountId: string) => Promise<AccessKeyList>;
  private readonly resolveRelayerKeyMaterial: ResolveRelayerKeyMaterialFn;

  constructor(input: {
    logger: NormalizedLogger;
    nodeRole: ThresholdNodeRole;
    coordinatorPeers: ThresholdCoordinatorPeer[];
    coordinatorSharedSecretBytes: Uint8Array | null;
    clientParticipantId: number;
    relayerParticipantId: number;
    participantIds2p: number[];
    sessionStore: ThresholdEd25519SessionStore;
    ensureReady: () => Promise<void>;
    ensureSignerWasm: () => Promise<void>;
    viewAccessKeyList: (accountId: string) => Promise<AccessKeyList>;
    resolveRelayerKeyMaterial: ResolveRelayerKeyMaterialFn;
  }) {
    this.logger = input.logger;
    this.nodeRole = input.nodeRole;
    this.coordinatorPeers = input.coordinatorPeers;
    this.coordinatorSharedSecretBytes = input.coordinatorSharedSecretBytes;
    this.clientParticipantId = input.clientParticipantId;
    this.relayerParticipantId = input.relayerParticipantId;
    this.participantIds2p = input.participantIds2p;
    this.sessionStore = input.sessionStore;
    this.ensureReady = input.ensureReady;
    this.ensureSignerWasm = input.ensureSignerWasm;
    this.viewAccessKeyList = input.viewAccessKeyList;
    this.resolveRelayerKeyMaterial = input.resolveRelayerKeyMaterial;
  }

  private createThresholdEd25519SigningSessionId(): string {
    const id = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `sign-${id}`;
  }

  private async signCoordinatorGrant(payload: ThresholdEd25519CoordinatorGrantV1): Promise<string | null> {
    const out = await signThresholdEd25519CoordinatorGrantV1({
      secretBytes: this.coordinatorSharedSecretBytes,
      keyPromise: this.coordinatorHmacKeyPromise,
      payload,
    });
    this.coordinatorHmacKeyPromise = out.keyPromise;
    return out.token;
  }

  private async verifyCoordinatorGrant(token: unknown): Promise<
    | { ok: true; grant: ThresholdEd25519CoordinatorGrantV1; mpcSession: ParsedThresholdEd25519MpcSession }
    | { ok: false; code: string; message: string }
  > {
    const verified = await verifyThresholdEd25519CoordinatorGrantV1({
      secretBytes: this.coordinatorSharedSecretBytes,
      keyPromise: this.coordinatorHmacKeyPromise,
      token,
    });
    this.coordinatorHmacKeyPromise = verified.keyPromise;
    if (!verified.ok) return verified;
    return { ok: true, grant: verified.grant, mpcSession: verified.mpcSession };
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
      const parsedRequest = parseThresholdEd25519SignInitRequest(request);
      if (!parsedRequest.ok) return parsedRequest;
      const { mpcSessionId, relayerKeyId, nearAccountId, signingDigestB64u, clientCommitments } = parsedRequest.value;

      const sess = await this.sessionStore.takeMpcSession(mpcSessionId);
      if (!sess) {
        return { ok: false, code: 'unauthorized', message: 'mpcSessionId expired or invalid' };
      }
      if (Date.now() > sess.expiresAtMs) {
        return { ok: false, code: 'unauthorized', message: 'mpcSessionId expired' };
      }

      const participantIdsRes = require2pParticipantIds(sess.participantIds, this.participantIds2p, 'mpcSessionId');
      if (!participantIdsRes.ok) return participantIdsRes;
      const participantIds = participantIdsRes.value;

      if (relayerKeyId !== sess.relayerKeyId) {
        return { ok: false, code: 'unauthorized', message: 'relayerKeyId does not match mpcSessionId scope' };
      }

      if (nearAccountId !== sess.userId) {
        return { ok: false, code: 'unauthorized', message: 'nearAccountId does not match mpcSessionId scope' };
      }

      if (signingDigestB64u !== sess.signingDigestB64u) {
        return { ok: false, code: 'unauthorized', message: 'signingDigestB64u does not match mpcSessionId scope' };
      }

      if (!this.coordinatorPeers.length) {
        const out = await this.peerSignInitFromMpcSessionRecord({ mpcSessionId, mpcSession: sess, clientCommitments });
        if (!out.ok) return out;

        return {
          ok: true,
          signingSessionId: out.signingSessionId,
          commitmentsById: {
            [String(this.clientParticipantId)]: clientCommitments,
            [String(this.relayerParticipantId)]: out.relayerCommitments,
          },
          relayerVerifyingSharesById: {
            [String(this.relayerParticipantId)]: out.relayerVerifyingShareB64u,
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
      const commitments = parseClientCommitments((request as unknown as { clientCommitments?: unknown }).clientCommitments);
      if (!commitments.ok) return commitments;
      const clientCommitments = commitments.value;

      const verified = await this.verifyCoordinatorGrant(request.coordinatorGrant);
      if (!verified.ok) {
        return { ok: false, code: verified.code, message: verified.message };
      }
      const { grant, mpcSession } = verified;

      if (grant.peerParticipantId !== this.relayerParticipantId) {
        return { ok: false, code: 'unauthorized', message: 'coordinatorGrant does not match this relayer participant id' };
      }

      const participantIdsRes = require2pParticipantIds(mpcSession.participantIds, this.participantIds2p, 'coordinatorGrant');
      if (!participantIdsRes.ok) return participantIdsRes;

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
      const parsedRequest = parseThresholdEd25519FinalizeRequest(request);
      if (!parsedRequest.ok) return parsedRequest;
      const { signingSessionId, clientSignatureShareB64u } = parsedRequest.value;

      const verified = await this.verifyCoordinatorGrant(request.coordinatorGrant);
      if (!verified.ok) {
        return { ok: false, code: verified.code, message: verified.message };
      }
      const { grant, mpcSession } = verified;

      if (grant.peerParticipantId !== this.relayerParticipantId) {
        return { ok: false, code: 'unauthorized', message: 'coordinatorGrant does not match this relayer participant id' };
      }

      const participantIdsRes = require2pParticipantIds(mpcSession.participantIds, this.participantIds2p, 'coordinatorGrant');
      if (!participantIdsRes.ok) return participantIdsRes;

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
  }): Promise<PeerSignInitResult> {
    const mpcSessionId = input.mpcSessionId;
    const sess = input.mpcSession;
    if (Date.now() > sess.expiresAtMs) {
      return { ok: false, code: 'unauthorized', message: 'mpcSessionId expired' };
    }

    const participantIdsRes = require2pParticipantIds(sess.participantIds, this.participantIds2p, 'mpcSessionId');
    if (!participantIdsRes.ok) return participantIdsRes;
    const participantIds = participantIdsRes.value;
    const signingDigestB64u = sess.signingDigestB64u;

    const key = await this.resolveRelayerKeyMaterial({
      relayerKeyId: sess.relayerKeyId,
      nearAccountId: sess.userId,
      rpId: sess.rpId,
      clientVerifyingShareB64u: sess.clientVerifyingShareB64u,
    });
    if (!key.ok) {
      return { ok: false, code: key.code, message: key.message };
    }

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
  }): Promise<PeerSignFinalizeResult> {
    const signingSessionId = input.signingSessionId;
    const clientSignatureShareB64u = input.clientSignatureShareB64u;

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

    if (input.expectedMpcSessionId && sess.mpcSessionId !== input.expectedMpcSessionId) {
      await restoreOnMismatch();
      return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
    }
    if (input.expectedRelayerKeyId && sess.relayerKeyId !== input.expectedRelayerKeyId) {
      await restoreOnMismatch();
      return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
    }
    if (input.expectedSigningDigestB64u && sess.signingDigestB64u !== input.expectedSigningDigestB64u) {
      await restoreOnMismatch();
      return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
    }
    if (input.expectedUserId && sess.userId !== input.expectedUserId) {
      await restoreOnMismatch();
      return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
    }
    if (input.expectedRpId && sess.rpId !== input.expectedRpId) {
      await restoreOnMismatch();
      return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
    }
    if (input.expectedClientVerifyingShareB64u && sess.clientVerifyingShareB64u !== input.expectedClientVerifyingShareB64u) {
      await restoreOnMismatch();
      return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
    }

    const participantIdsRes = require2pParticipantIds(sess.participantIds, this.participantIds2p, 'signingSessionId');
    if (!participantIdsRes.ok) return participantIdsRes;

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
    const clientCommitments = sess.commitmentsById?.[String(this.clientParticipantId)];
    const relayerCommitments = sess.commitmentsById?.[String(this.relayerParticipantId)];
    if (!clientCommitments || !relayerCommitments) {
      return { ok: false, code: 'internal', message: 'signingSessionId missing commitment transcript' };
    }
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
      const parsedRequest = parseThresholdEd25519FinalizeRequest(request);
      if (!parsedRequest.ok) return parsedRequest;
      const { signingSessionId, clientSignatureShareB64u } = parsedRequest.value;

      if (!this.coordinatorPeers.length) {
        const out = await this.peerSignFinalizeFromSigningSessionId({ signingSessionId, clientSignatureShareB64u });
        if (!out.ok) return out;
        return {
          ok: true,
          relayerSignatureSharesById: {
            [String(this.relayerParticipantId)]: out.relayerSignatureShareB64u,
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

      const participantIdsRes = require2pParticipantIds(sess.participantIds, this.participantIds2p, 'signingSessionId');
      if (!participantIdsRes.ok) return participantIdsRes;
      const participantIds = participantIdsRes.value;

      const relayerIds = participantIds.filter((id) => id !== this.clientParticipantId);
      if (relayerIds.length !== 1) {
        return { ok: false, code: 'multi_party_not_supported', message: 'multi-party coordinator fanout is not supported yet' };
      }
      const [peerId] = relayerIds;

      const peerSigningSessionId = sess.peerSigningSessionIdsById?.[String(peerId)];
      const peerRelayerUrl = sess.peerRelayerUrlsById?.[String(peerId)];
      const peerCoordinatorGrant = sess.peerCoordinatorGrantsById?.[String(peerId)];
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
