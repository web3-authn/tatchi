import type { AccessKeyList } from '../../../core/NearClient';
import { base64UrlDecode, base64UrlEncode } from '../../../utils/encoders';
import { toOptionalTrimmedString } from '../../../utils/validation';
import type { NormalizedLogger } from '../logger';
import type {
  ThresholdEd25519CosignFinalizeRequest,
  ThresholdEd25519CosignFinalizeResponse,
  ThresholdEd25519CosignInitRequest,
  ThresholdEd25519CosignInitResponse,
  ThresholdEd25519SignFinalizeRequest,
  ThresholdEd25519SignFinalizeResponse,
  ThresholdEd25519SignInitRequest,
  ThresholdEd25519SignInitResponse,
} from '../types';
import {
  threshold_ed25519_round1_commit,
  threshold_ed25519_round2_sign,
  threshold_ed25519_round2_sign_cosigner,
} from '../../../wasm_signer_worker/pkg/wasm_signer_worker.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { ensureRelayerKeyIsActiveAccessKey } from './validation';
import type {
  ThresholdEd25519Commitments,
  ThresholdEd25519CommitmentsById,
  ThresholdEd25519MpcSessionRecord,
  ThresholdEd25519SessionStore,
} from './stores/SessionStore';
import {
  normalizeThresholdEd25519ParticipantIds,
} from '../../../threshold/participants';
import type { ThresholdNodeRole, ThresholdRelayerCosignerPeer } from './config';
import type {
  ParsedThresholdEd25519MpcSession,
  ThresholdEd25519CosignerGrantV1,
} from './coordinatorGrant';
import {
  signThresholdEd25519CosignerGrantV1,
  verifyThresholdEd25519CosignerGrantV1,
} from './coordinatorGrant';
import {
  addEd25519ScalarsB64u,
  deriveRelayerCosignerSharesFromRelayerSigningShare,
  lagrangeCoefficientAtZeroForCosigner,
  multiplyEd25519ScalarB64uByScalarBytesLE32,
  normalizeCosignerIds,
} from './cosigners';

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

function parseCommitments(input: unknown, label: string): ParseResult<ThresholdEd25519Commitments> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, code: 'invalid_body', message: `${label}{hiding,binding} are required` };
  }
  const rec = input as Record<string, unknown>;
  const hiding = toOptionalTrimmedString(rec.hiding);
  const binding = toOptionalTrimmedString(rec.binding);
  if (!hiding || !binding) {
    return { ok: false, code: 'invalid_body', message: `${label}{hiding,binding} are required` };
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

  const commitments = parseCommitments((request as unknown as { clientCommitments?: unknown }).clientCommitments, 'clientCommitments');
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

function parseThresholdEd25519CosignInitRequest(request: ThresholdEd25519CosignInitRequest): ParseResult<{
  signingSessionId: string;
  cosignerShareB64u: string;
  clientCommitments: ThresholdEd25519Commitments;
}> {
  const signingSessionId = toOptionalTrimmedString(request.signingSessionId);
  if (!signingSessionId) return { ok: false, code: 'invalid_body', message: 'signingSessionId is required' };

  const cosignerShareB64u = toOptionalTrimmedString(request.cosignerShareB64u);
  if (!cosignerShareB64u) return { ok: false, code: 'invalid_body', message: 'cosignerShareB64u is required' };
  try {
    const decoded = base64UrlDecode(cosignerShareB64u);
    if (decoded.length !== 32) {
      return { ok: false, code: 'invalid_body', message: `cosignerShareB64u must be 32 bytes, got ${decoded.length}` };
    }
  } catch (e: unknown) {
    return { ok: false, code: 'invalid_body', message: `Invalid cosignerShareB64u: ${String(e || 'decode failed')}` };
  }

  const commitments = parseCommitments((request as unknown as { clientCommitments?: unknown }).clientCommitments, 'clientCommitments');
  if (!commitments.ok) return commitments;

  return { ok: true, value: { signingSessionId, cosignerShareB64u, clientCommitments: commitments.value } };
}

function parseThresholdEd25519CosignFinalizeRequest(request: ThresholdEd25519CosignFinalizeRequest): ParseResult<{
  signingSessionId: string;
  cosignerIds: number[];
  groupPublicKey: string;
  relayerCommitments: ThresholdEd25519Commitments;
}> {
  const signingSessionId = toOptionalTrimmedString(request.signingSessionId);
  if (!signingSessionId) return { ok: false, code: 'invalid_body', message: 'signingSessionId is required' };

  const groupPublicKey = toOptionalTrimmedString(request.groupPublicKey);
  if (!groupPublicKey) return { ok: false, code: 'invalid_body', message: 'groupPublicKey is required' };

  const cosignerIds = normalizeCosignerIds((request as unknown as { cosignerIds?: unknown }).cosignerIds);
  if (!cosignerIds) return { ok: false, code: 'invalid_body', message: 'cosignerIds must be a non-empty list of u16 ids' };

  const relayerCommitments = parseCommitments((request as unknown as { relayerCommitments?: unknown }).relayerCommitments, 'relayerCommitments');
  if (!relayerCommitments.ok) return relayerCommitments;

  return { ok: true, value: { signingSessionId, cosignerIds, groupPublicKey, relayerCommitments: relayerCommitments.value } };
}

function requireParticipantIdsIncludeSignerSet(raw: unknown, signerSet2p: number[], label: string): ParseResult<number[]> {
  const expected = normalizeThresholdEd25519ParticipantIds(signerSet2p) || [...signerSet2p];
  const participantIds = normalizeThresholdEd25519ParticipantIds(raw) || [...expected];

  for (const id of expected) {
    if (!participantIds.includes(id)) {
      return {
        ok: false,
        code: 'unauthorized',
        message: `${label} does not include the server signer set (expected participantIds to include [${expected.join(',')}])`,
      };
    }
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

function sumEd25519PointsB64u(pointsB64u: string[], label: string): string {
  if (!pointsB64u.length) throw new Error(`${label}: empty point list`);
  let acc = ed25519.Point.ZERO;
  for (const p of pointsB64u) {
    const raw = toOptionalTrimmedString(p);
    if (!raw) throw new Error(`${label}: missing point`);
    const bytes = base64UrlDecode(raw);
    if (bytes.length !== 32) throw new Error(`${label}: expected 32-byte point, got ${bytes.length}`);
    const pt = ed25519.Point.fromBytes(bytes);
    acc = acc.add(pt);
  }
  return base64UrlEncode(acc.toBytes());
}

function combineCommitmentsByAddition(commitments: ThresholdEd25519Commitments[], label: string): ThresholdEd25519Commitments {
  if (!commitments.length) throw new Error(`${label}: empty commitments`);
  const hiding = sumEd25519PointsB64u(commitments.map((c) => c.hiding), `${label}.hiding`);
  const binding = sumEd25519PointsB64u(commitments.map((c) => c.binding), `${label}.binding`);
  return { hiding, binding };
}

export class ThresholdEd25519SigningHandlers {
  private readonly logger: NormalizedLogger;
  private readonly nodeRole: ThresholdNodeRole;
  private readonly relayerCosigners: ThresholdRelayerCosignerPeer[];
  private readonly relayerCosignerThreshold: number | null;
  private readonly relayerCosignerId: number | null;
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
    relayerCosigners: ThresholdRelayerCosignerPeer[];
    relayerCosignerThreshold: number | null;
    relayerCosignerId: number | null;
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
    this.relayerCosigners = input.relayerCosigners;
    this.relayerCosignerThreshold = input.relayerCosignerThreshold;
    this.relayerCosignerId = input.relayerCosignerId;
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

  private logResult(route: string, startedAtMs: number, result: { ok: boolean; code?: string; message?: string }, extra?: Record<string, unknown>): void {
    const elapsedMs = Math.max(0, Date.now() - startedAtMs);
    const msg = typeof result.message === 'string' ? result.message : undefined;
    const message = msg && msg.length > 300 ? `${msg.slice(0, 297)}...` : msg;
    const payload = {
      route,
      ok: result.ok,
      ...(result.code ? { code: result.code } : {}),
      ...(!result.ok && message ? { message } : {}),
      elapsedMs,
      ...(extra || {}),
    };
    if (result.ok) {
      this.logger.info('[threshold-ed25519] response', payload);
      return;
    }
    if (result.code === 'internal') {
      this.logger.error('[threshold-ed25519] response', payload);
      return;
    }
    this.logger.warn('[threshold-ed25519] response', payload);
  }

  private createThresholdEd25519SigningSessionId(): string {
    const id = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `sign-${id}`;
  }

  private async signCosignerGrant(payload: ThresholdEd25519CosignerGrantV1): Promise<string | null> {
    const out = await signThresholdEd25519CosignerGrantV1({
      secretBytes: this.coordinatorSharedSecretBytes,
      keyPromise: this.coordinatorHmacKeyPromise,
      payload,
    });
    this.coordinatorHmacKeyPromise = out.keyPromise;
    return out.token;
  }

  private async verifyCosignerGrant(token: unknown): Promise<
    | { ok: true; grant: ThresholdEd25519CosignerGrantV1; mpcSession: ParsedThresholdEd25519MpcSession }
    | { ok: false; code: string; message: string }
  > {
    const verified = await verifyThresholdEd25519CosignerGrantV1({
      secretBytes: this.coordinatorSharedSecretBytes,
      keyPromise: this.coordinatorHmacKeyPromise,
      token,
    });
    this.coordinatorHmacKeyPromise = verified.keyPromise;
    if (!verified.ok) return verified;
    return { ok: true, grant: verified.grant, mpcSession: verified.mpcSession };
  }

  async thresholdEd25519SignInit(request: ThresholdEd25519SignInitRequest): Promise<ThresholdEd25519SignInitResponse> {
    const route = '/threshold-ed25519/sign/init';
    const startedAtMs = Date.now();
    let logExtra: Record<string, unknown> | undefined;

    const result = await (async (): Promise<ThresholdEd25519SignInitResponse> => {
      if (this.nodeRole !== 'coordinator') {
        return {
          ok: false,
          code: 'not_found',
          message: 'threshold-ed25519 signing endpoints are not enabled on this server (set THRESHOLD_NODE_ROLE=coordinator)',
        };
      }

      await this.ensureReady();
      const parsedRequest = parseThresholdEd25519SignInitRequest(request);
      if (!parsedRequest.ok) return parsedRequest;
      const { mpcSessionId, relayerKeyId, nearAccountId, signingDigestB64u, clientCommitments } = parsedRequest.value;

      this.logger.info('[threshold-ed25519] request', {
        route,
        mpcSessionId,
        relayerKeyId,
        nearAccountId,
        signingDigestB64u_len: signingDigestB64u.length,
      });

      const sess = await this.sessionStore.takeMpcSession(mpcSessionId);
      if (!sess) {
        return { ok: false, code: 'unauthorized', message: 'mpcSessionId expired or invalid' };
      }
      if (Date.now() > sess.expiresAtMs) {
        return { ok: false, code: 'unauthorized', message: 'mpcSessionId expired' };
      }

      const groupParticipantIds =
        normalizeThresholdEd25519ParticipantIds(sess.participantIds) || [...this.participantIds2p];

      if (relayerKeyId !== sess.relayerKeyId) {
        return { ok: false, code: 'unauthorized', message: 'relayerKeyId does not match mpcSessionId scope' };
      }

      if (nearAccountId !== sess.userId) {
        return { ok: false, code: 'unauthorized', message: 'nearAccountId does not match mpcSessionId scope' };
      }

      if (signingDigestB64u !== sess.signingDigestB64u) {
        return { ok: false, code: 'unauthorized', message: 'signingDigestB64u does not match mpcSessionId scope' };
      }

      const hasRelayerCosignerConfig = this.relayerCosigners.length > 0 || this.relayerCosignerThreshold !== null;
      if (hasRelayerCosignerConfig) {
        logExtra = { mode: 'cosigner' };
        if (!this.relayerCosigners.length) {
          return { ok: false, code: 'missing_config', message: 'THRESHOLD_ED25519_RELAYER_COSIGNERS is required for relayer cosigning mode' };
        }
        const t = this.relayerCosignerThreshold;
        if (!t) {
          return { ok: false, code: 'missing_config', message: 'THRESHOLD_ED25519_RELAYER_COSIGNER_T is required for relayer cosigning mode' };
        }

        const signerSetRes = requireParticipantIdsIncludeSignerSet(groupParticipantIds, this.participantIds2p, 'mpcSessionId');
        if (!signerSetRes.ok) return signerSetRes;

        const cosignerIdsAll =
          normalizeCosignerIds(Array.from(new Set(this.relayerCosigners.map((p) => p.cosignerId)))) || [];
        logExtra = { ...logExtra, cosignerIdsAll, t };
        if (cosignerIdsAll.length === 0) {
          return { ok: false, code: 'missing_config', message: 'THRESHOLD_ED25519_RELAYER_COSIGNERS must include at least one cosignerId' };
        }
        if (t > cosignerIdsAll.length) {
          return {
            ok: false,
            code: 'missing_config',
            message: `THRESHOLD_ED25519_RELAYER_COSIGNER_T must be <= number of cosigners (got t=${t}, n=${cosignerIdsAll.length})`,
          };
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

        const scope = await ensureRelayerKeyIsActiveAccessKey({
          nearAccountId: sess.userId,
          relayerPublicKey: key.publicKey,
          viewAccessKeyList: this.viewAccessKeyList,
        });
        if (!scope.ok) {
          return { ok: false, code: scope.code, message: scope.message };
        }

        const shares = deriveRelayerCosignerSharesFromRelayerSigningShare({
          relayerSigningShareB64u: key.relayerSigningShareB64u,
          cosignerIds: cosignerIdsAll,
          cosignerThreshold: t,
        });
        if (!shares.ok) {
          return { ok: false, code: shares.code, message: shares.message };
        }

        const now = Math.floor(Date.now() / 1000);
        const exp = now + 60;
        const signingSessionId = this.createThresholdEd25519SigningSessionId();
        const ttlMs = 60_000;
        const expiresAtMs = Date.now() + ttlMs;
        this.logger.info('[threshold-ed25519] cosign/init fanout', { route, signingSessionId, cosignerIdsAll, t });

        const initResults = await Promise.all(cosignerIdsAll.map(async (cosignerId) => {
          const cosignerShareB64u = shares.sharesByCosignerId[String(cosignerId)];
          if (!cosignerShareB64u) {
            return { ok: false as const, cosignerId, code: 'internal', message: 'missing derived cosigner share' };
          }

          const grant = await this.signCosignerGrant({
            v: 1,
            typ: 'threshold_ed25519_cosigner_grant_v1',
            iat: now,
            exp,
            mpcSessionId,
            cosignerId,
            mpcSession: sess,
          });
          if (!grant) {
            return { ok: false as const, cosignerId, code: 'missing_config', message: 'THRESHOLD_COORDINATOR_SHARED_SECRET_B64U is required for relayer cosigning' };
          }

          const candidates = this.relayerCosigners.filter((p) => p.cosignerId === cosignerId);
          if (!candidates.length) {
            return { ok: false as const, cosignerId, code: 'missing_config', message: `Missing relayer cosigner peer for cosignerId=${cosignerId}` };
          }

          let lastErr: { code: string; message: string } | null = null;
          for (const peer of candidates) {
            const initUrl = `${peer.relayerUrl}/threshold-ed25519/internal/cosign/init`;
            const peerInit = await this.postJsonWithTimeout(initUrl, {
              coordinatorGrant: grant,
              signingSessionId,
              cosignerShareB64u,
              clientCommitments,
            }, 10_000);
            if (!peerInit.ok) {
              lastErr = peerInit;
              continue;
            }

            const initJson = peerInit.json as ThresholdEd25519CosignInitResponse;
            if (!initJson?.ok) {
              lastErr = { code: initJson?.code || 'internal', message: initJson?.message || 'cosign/init failed' };
              continue;
            }
            const commitments = initJson.relayerCommitments;
            if (!commitments?.hiding || !commitments?.binding) {
              lastErr = { code: 'internal', message: 'cosign/init produced incomplete commitments' };
              continue;
            }
            return {
              ok: true as const,
              cosignerId,
              cosignerGrant: grant,
              relayerUrl: peer.relayerUrl,
              relayerCommitments: commitments,
            };
          }

          if (lastErr) {
            this.logger.warn('[threshold-ed25519] cosign/init failed', {
              route,
              signingSessionId,
              cosignerId,
              candidateRelayerUrls: candidates.map((p) => p.relayerUrl),
              code: lastErr.code,
              message: lastErr.message,
            });
          }
          return { ok: false as const, cosignerId, code: lastErr?.code || 'unavailable', message: lastErr?.message || 'No cosigner available for cosign/init' };
        }));

        const okInits = initResults.filter((r): r is {
          ok: true;
          cosignerId: number;
          cosignerGrant: string;
          relayerUrl: string;
          relayerCommitments: ThresholdEd25519Commitments;
        } => r.ok);

        if (okInits.length < t) {
          const errors = initResults.filter((r) => !r.ok);
          const lastErr = errors.length ? errors[errors.length - 1] : null;
          logExtra = { ...logExtra, signingSessionId, okCosigners: okInits.length };
          return {
            ok: false,
            code: lastErr?.code || 'unavailable',
            message: `Need at least ${t} relayer cosigners; got ${okInits.length}`,
          };
        }

        okInits.sort((a, b) => a.cosignerId - b.cosignerId);
        const selected = okInits.slice(0, t);
        const selectedCosignerIds = selected.map((r) => r.cosignerId);

        const relayerCommitments = combineCommitmentsByAddition(
          selected.map((r) => r.relayerCommitments),
          'cosignerCommitments',
        );

        const commitmentsById: ThresholdEd25519CommitmentsById = {
          [String(this.clientParticipantId)]: clientCommitments,
          [String(this.relayerParticipantId)]: relayerCommitments,
        };
        const relayerVerifyingSharesById = {
          [String(this.relayerParticipantId)]: key.relayerVerifyingShareB64u,
        };
        const cosignerRelayerUrlsById: Record<string, string> = {};
        const cosignerCoordinatorGrantsById: Record<string, string> = {};
        for (const r of selected) {
          cosignerRelayerUrlsById[String(r.cosignerId)] = r.relayerUrl;
          cosignerCoordinatorGrantsById[String(r.cosignerId)] = r.cosignerGrant;
        }

        await this.sessionStore.putCoordinatorSigningSession(signingSessionId, {
          mode: 'cosigner',
          expiresAtMs,
          mpcSessionId,
          relayerKeyId: sess.relayerKeyId,
          signingDigestB64u: sess.signingDigestB64u,
          userId: sess.userId,
          rpId: sess.rpId,
          clientVerifyingShareB64u: sess.clientVerifyingShareB64u,
          commitmentsById,
          participantIds: [...this.participantIds2p],
          groupPublicKey: key.publicKey,
          cosignerIds: selectedCosignerIds,
          cosignerRelayerUrlsById,
          cosignerCoordinatorGrantsById,
          relayerVerifyingSharesById,
        }, ttlMs);

        logExtra = { ...logExtra, signingSessionId, selectedCosignerIds };
        return {
          ok: true,
          signingSessionId,
          commitmentsById,
          relayerVerifyingSharesById,
          participantIds: [...this.participantIds2p],
        };
      }

      logExtra = { mode: 'local' };
      const signerSetRes = requireParticipantIdsIncludeSignerSet(groupParticipantIds, this.participantIds2p, 'mpcSessionId');
      if (!signerSetRes.ok) return signerSetRes;
      const out = await this.peerSignInitFromMpcSessionRecord({ mpcSessionId, mpcSession: sess, clientCommitments });
      if (!out.ok) return out;

      logExtra = { ...logExtra, signingSessionId: out.signingSessionId };
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
        participantIds: [...this.participantIds2p],
      };
    })().catch((e: unknown) => {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    });

    this.logResult(route, startedAtMs, result, logExtra);
    return result;
  }

  async thresholdEd25519CosignInit(request: ThresholdEd25519CosignInitRequest): Promise<ThresholdEd25519CosignInitResponse> {
    const route = '/threshold-ed25519/internal/cosign/init';
    const startedAtMs = Date.now();
    const cosignerId = this.relayerCosignerId;
    const logExtra = cosignerId ? { cosignerId } : undefined;

    const result = await (async (): Promise<ThresholdEd25519CosignInitResponse> => {
      if (!cosignerId || (this.nodeRole !== 'cosigner' && this.nodeRole !== 'coordinator')) {
        return { ok: false, code: 'not_found', message: 'threshold-ed25519 cosigner endpoints are not enabled on this server (set THRESHOLD_NODE_ROLE=cosigner)' };
      }

      await this.ensureReady();
      const parsedRequest = parseThresholdEd25519CosignInitRequest(request);
      if (!parsedRequest.ok) return parsedRequest;
      const { signingSessionId, cosignerShareB64u, clientCommitments } = parsedRequest.value;

      this.logger.info('[threshold-ed25519] request', {
        route,
        signingSessionId,
        cosignerId,
        cosignerShareB64u_len: cosignerShareB64u.length,
      });

      const verified = await this.verifyCosignerGrant(request.coordinatorGrant);
      if (!verified.ok) {
        return { ok: false, code: verified.code, message: verified.message };
      }
      const { grant, mpcSession } = verified;

      if (grant.cosignerId !== cosignerId) {
        return { ok: false, code: 'unauthorized', message: 'coordinatorGrant does not match this cosigner id' };
      }

      const participantIdsRes = requireParticipantIdsIncludeSignerSet(mpcSession.participantIds, this.participantIds2p, 'coordinatorGrant');
      if (!participantIdsRes.ok) return participantIdsRes;

      await this.ensureSignerWasm();
      const commit = expectThresholdEd25519Round1CommitWasmOutput(
        threshold_ed25519_round1_commit(cosignerShareB64u),
      );

      const ttlMs = 60_000;
      const expiresAtMs = Date.now() + ttlMs;
      const commitmentsById: ThresholdEd25519CommitmentsById = {
        [String(this.clientParticipantId)]: clientCommitments,
      };

      await this.sessionStore.putSigningSession(signingSessionId, {
        expiresAtMs,
        mpcSessionId: grant.mpcSessionId,
        relayerKeyId: mpcSession.relayerKeyId,
        signingDigestB64u: mpcSession.signingDigestB64u,
        userId: mpcSession.userId,
        rpId: mpcSession.rpId,
        clientVerifyingShareB64u: mpcSession.clientVerifyingShareB64u,
        commitmentsById,
        relayerSigningShareB64u: cosignerShareB64u,
        relayerNoncesB64u: commit.relayerNoncesB64u,
        participantIds: [...this.participantIds2p],
      }, ttlMs);

      return { ok: true, relayerCommitments: commit.relayerCommitments };
    })().catch((e: unknown) => {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    });

    this.logResult(route, startedAtMs, result, logExtra);
    return result;
  }

  async thresholdEd25519CosignFinalize(request: ThresholdEd25519CosignFinalizeRequest): Promise<ThresholdEd25519CosignFinalizeResponse> {
    const route = '/threshold-ed25519/internal/cosign/finalize';
    const startedAtMs = Date.now();
    const cosignerId = this.relayerCosignerId;
    const logExtra = cosignerId ? { cosignerId } : undefined;

    const result = await (async (): Promise<ThresholdEd25519CosignFinalizeResponse> => {
      if (!cosignerId || (this.nodeRole !== 'cosigner' && this.nodeRole !== 'coordinator')) {
        return { ok: false, code: 'not_found', message: 'threshold-ed25519 cosigner endpoints are not enabled on this server (set THRESHOLD_NODE_ROLE=cosigner)' };
      }

      await this.ensureReady();
      const parsedRequest = parseThresholdEd25519CosignFinalizeRequest(request);
      if (!parsedRequest.ok) return parsedRequest;
      const { signingSessionId, cosignerIds, groupPublicKey, relayerCommitments } = parsedRequest.value;

      this.logger.info('[threshold-ed25519] request', {
        route,
        signingSessionId,
        cosignerId,
        cosignerIds,
      });

      const verified = await this.verifyCosignerGrant(request.coordinatorGrant);
      if (!verified.ok) {
        return { ok: false, code: verified.code, message: verified.message };
      }
      const { grant, mpcSession } = verified;

      if (grant.cosignerId !== cosignerId) {
        return { ok: false, code: 'unauthorized', message: 'coordinatorGrant does not match this cosigner id' };
      }

      if (!cosignerIds.includes(cosignerId)) {
        return { ok: false, code: 'unauthorized', message: 'cosignerIds must include this cosigner id' };
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

      if (sess.mpcSessionId !== grant.mpcSessionId) {
        await restoreOnMismatch();
        return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
      }
      if (sess.relayerKeyId !== mpcSession.relayerKeyId) {
        await restoreOnMismatch();
        return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
      }
      if (sess.signingDigestB64u !== mpcSession.signingDigestB64u) {
        await restoreOnMismatch();
        return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
      }
      if (sess.userId !== mpcSession.userId) {
        await restoreOnMismatch();
        return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
      }
      if (sess.rpId !== mpcSession.rpId) {
        await restoreOnMismatch();
        return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
      }
      if (sess.clientVerifyingShareB64u !== mpcSession.clientVerifyingShareB64u) {
        await restoreOnMismatch();
        return { ok: false, code: 'unauthorized', message: 'signingSessionId does not match coordinatorGrant scope' };
      }

      const storedShareB64u = toOptionalTrimmedString(sess.relayerSigningShareB64u);
      if (!storedShareB64u) {
        return { ok: false, code: 'internal', message: 'cosigner signing session missing share material' };
      }

      const lambdaRes = lagrangeCoefficientAtZeroForCosigner({ cosignerId, cosignerIds });
      if (!lambdaRes.ok) {
        return { ok: false, code: lambdaRes.code, message: lambdaRes.message };
      }

      const effShare = multiplyEd25519ScalarB64uByScalarBytesLE32({
        scalarB64u: storedShareB64u,
        factorBytesLE32: lambdaRes.lambda,
      });
      if (!effShare.ok) {
        return { ok: false, code: effShare.code, message: effShare.message };
      }

      await this.ensureSignerWasm();
      const clientCommitments = sess.commitmentsById?.[String(this.clientParticipantId)];
      if (!clientCommitments) {
        return { ok: false, code: 'internal', message: 'signingSessionId missing client commitments' };
      }
      const out = expectThresholdEd25519Round2SignWasmOutput(threshold_ed25519_round2_sign_cosigner({
        clientParticipantId: this.clientParticipantId,
        relayerParticipantId: this.relayerParticipantId,
        relayerSigningShareB64u: effShare.scalarB64u,
        relayerNoncesB64u: sess.relayerNoncesB64u,
        groupPublicKey,
        signingDigestB64u: sess.signingDigestB64u,
        clientCommitments,
        relayerCommitments,
      }));

      return { ok: true, relayerSignatureShareB64u: out.relayerSignatureShareB64u };
    })().catch((e: unknown) => {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    });

    this.logResult(route, startedAtMs, result, logExtra);
    return result;
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

    const participantIdsRes = requireParticipantIdsIncludeSignerSet(sess.participantIds, this.participantIds2p, 'mpcSessionId');
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

    const participantIdsRes = requireParticipantIdsIncludeSignerSet(sess.participantIds, this.participantIds2p, 'signingSessionId');
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
    const route = '/threshold-ed25519/sign/finalize';
    const startedAtMs = Date.now();
    let logExtra: Record<string, unknown> | undefined;

    const result = await (async (): Promise<ThresholdEd25519SignFinalizeResponse> => {
      if (this.nodeRole !== 'coordinator') {
        return {
          ok: false,
          code: 'not_found',
          message: 'threshold-ed25519 signing endpoints are not enabled on this server (set THRESHOLD_NODE_ROLE=coordinator)',
        };
      }

      await this.ensureReady();
      const parsedRequest = parseThresholdEd25519FinalizeRequest(request);
      if (!parsedRequest.ok) return parsedRequest;
      const { signingSessionId, clientSignatureShareB64u } = parsedRequest.value;

      this.logger.info('[threshold-ed25519] request', {
        route,
        signingSessionId,
        clientSignatureShareB64u_len: clientSignatureShareB64u.length,
      });

      const coord = await this.sessionStore.takeCoordinatorSigningSession(signingSessionId);
      if (!coord) {
        logExtra = { mode: 'local', signingSessionId };
        const out = await this.peerSignFinalizeFromSigningSessionId({ signingSessionId, clientSignatureShareB64u });
        if (!out.ok) return out;
        return {
          ok: true,
          relayerSignatureSharesById: {
            [String(this.relayerParticipantId)]: out.relayerSignatureShareB64u,
          },
        };
      }

      if (Date.now() > coord.expiresAtMs) {
        logExtra = { mode: coord.mode, signingSessionId };
        return { ok: false, code: 'unauthorized', message: 'signingSessionId expired' };
      }

      if (coord.mode === 'cosigner') {
        const cosignerIds = normalizeCosignerIds(coord.cosignerIds);
        logExtra = { mode: 'cosigner', signingSessionId, cosignerIds };
        if (!cosignerIds || cosignerIds.length === 0) {
          return { ok: false, code: 'internal', message: 'coordinator signing session missing cosignerIds' };
        }

        const relayerCommitments = coord.commitmentsById?.[String(this.relayerParticipantId)];
        if (!relayerCommitments?.hiding || !relayerCommitments?.binding) {
          return { ok: false, code: 'internal', message: 'coordinator signing session missing relayer commitments' };
        }

        this.logger.info('[threshold-ed25519] cosign/finalize fanout', { route, signingSessionId, cosignerIds });

        const sharesByCosignerId: Record<string, string> = {};
        let lastPeerErr: { code: string; message: string } | null = null;

        for (const cosignerId of cosignerIds) {
          const cosignerRelayerUrl = coord.cosignerRelayerUrlsById?.[String(cosignerId)];
          const cosignerGrant = coord.cosignerCoordinatorGrantsById?.[String(cosignerId)];
          if (!cosignerRelayerUrl || !cosignerGrant) {
            return { ok: false, code: 'internal', message: 'coordinator signing session missing cosigner mapping' };
          }

          const candidates = [
            cosignerRelayerUrl,
            ...this.relayerCosigners.filter((p) => p.cosignerId === cosignerId).map((p) => p.relayerUrl),
          ].filter((url, idx, arr) => arr.indexOf(url) === idx);

          let cosignerShare: string | null = null;
          for (const relayerUrl of candidates) {
            const finalizeUrl = `${relayerUrl}/threshold-ed25519/internal/cosign/finalize`;
            const peerFinalize = await this.postJsonWithTimeout(finalizeUrl, {
              coordinatorGrant: cosignerGrant,
              signingSessionId,
              cosignerIds,
              groupPublicKey: coord.groupPublicKey,
              relayerCommitments,
            }, 10_000);
            if (!peerFinalize.ok) {
              lastPeerErr = peerFinalize;
              continue;
            }

            const finalizeJson = peerFinalize.json as ThresholdEd25519CosignFinalizeResponse;
            if (!finalizeJson?.ok) {
              lastPeerErr = { code: finalizeJson?.code || 'internal', message: finalizeJson?.message || 'cosign/finalize failed' };
              continue;
            }
            const share = toOptionalTrimmedString(finalizeJson.relayerSignatureShareB64u);
            if (!share) {
              lastPeerErr = { code: 'internal', message: 'cosign/finalize produced empty signature share' };
              continue;
            }
            cosignerShare = share;
            break;
          }
          if (!cosignerShare) {
            if (lastPeerErr) {
              this.logger.warn('[threshold-ed25519] cosign/finalize failed', {
                route,
                signingSessionId,
                cosignerId,
                candidateRelayerUrls: candidates,
                code: lastPeerErr.code,
                message: lastPeerErr.message,
              });
            }
            logExtra = { ...logExtra, failedCosignerId: cosignerId };
            return {
              ok: false,
              code: lastPeerErr?.code || 'unavailable',
              message: lastPeerErr?.message || `No cosigner available for cosign/finalize (cosignerId=${cosignerId})`,
            };
          }

          sharesByCosignerId[String(cosignerId)] = cosignerShare;
        }

        const summed = addEd25519ScalarsB64u({ scalarsB64u: Object.values(sharesByCosignerId) });
        if (!summed.ok) {
          return { ok: false, code: summed.code, message: summed.message };
        }

        return {
          ok: true,
          relayerSignatureSharesById: {
            [String(this.relayerParticipantId)]: summed.scalarB64u,
          },
        };
      }

      logExtra = { mode: (coord as unknown as { mode?: unknown }).mode, signingSessionId };
      return { ok: false, code: 'internal', message: 'coordinator signing session has invalid mode' };
    })().catch((e: unknown) => {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Internal error');
      return { ok: false, code: 'internal', message: msg };
    });

    this.logResult(route, startedAtMs, result, logExtra);
    return result;
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
