export type ThresholdParticipantRole = 'client' | 'relayer';

import { toOptionalTrimmedString } from '../utils/validation';
import {
  THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID,
  THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID,
  THRESHOLD_ED25519_2P_PARTICIPANT_IDS,
} from '../core/defaultConfigs';

export {
  THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID,
  THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID,
  THRESHOLD_ED25519_2P_PARTICIPANT_IDS,
};

/**
 * Metadata describing how a participant share is derived/stored.
 * This is informational in v1 and may be used for validation/policy later.
 */
export type ThresholdEd25519ShareDerivation =
  | 'prf_first_v1'
  | 'derived_master_secret_v1'
  | 'kv_random_v1'
  | 'unknown';

export interface ThresholdEd25519ParticipantV1 {
  /** FROST identifier (1-indexed). */
  id: number;
  role: ThresholdParticipantRole;
  /** Optional relayer endpoint for this participant (future multi-relayer support). */
  relayerUrl?: string;
  /** Key/share identifier understood by this participant (e.g. relayerKeyId). */
  relayerKeyId?: string;
  /** Base64url-encoded 32-byte verifying share (compressed EdwardsY). */
  verifyingShareB64u?: string;
  shareDerivation?: ThresholdEd25519ShareDerivation;
}

export const THRESHOLD_ED25519_PARTICIPANT_SET_V1 = 'threshold_ed25519_participants_v1' as const;

export interface ThresholdEd25519ParticipantSetV1 {
  version: typeof THRESHOLD_ED25519_PARTICIPANT_SET_V1;
  groupPublicKey: string;
  participants: ThresholdEd25519ParticipantV1[];
}

export function normalizeThresholdEd25519ParticipantId(id: unknown): number | null {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n < 1 || n > 65_535) return null;
  return n;
}

export function normalizeThresholdEd25519ParticipantIds(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: number[] = [];
  const seen = new Set<number>();
  for (const v of input) {
    const id = normalizeThresholdEd25519ParticipantId(v);
    if (!id) return null;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  out.sort((a, b) => a - b);
  return out.length ? out : null;
}

export function areThresholdEd25519ParticipantIds2p(
  participantIds: number[] | null | undefined,
  expected: readonly number[] = THRESHOLD_ED25519_2P_PARTICIPANT_IDS,
): boolean {
  const ids = normalizeThresholdEd25519ParticipantIds(participantIds);
  const expectedIds = normalizeThresholdEd25519ParticipantIds([...expected]);
  if (!ids || !expectedIds) return false;
  if (ids.length !== expectedIds.length) return false;
  return ids.every((id, i) => id === expectedIds[i]);
}

export function parseThresholdEd25519ParticipantsV1(input: unknown): ThresholdEd25519ParticipantV1[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;

  const out: ThresholdEd25519ParticipantV1[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const rec = item as Record<string, unknown>;

    const id = normalizeThresholdEd25519ParticipantId(rec.id);
    const role = toOptionalTrimmedString(rec.role);
    if (!id || (role !== 'client' && role !== 'relayer')) return null;

    const participant: ThresholdEd25519ParticipantV1 = {
      id,
      role: role as ThresholdParticipantRole,
    };

    const relayerUrl = toOptionalTrimmedString(rec.relayerUrl);
    if (relayerUrl) participant.relayerUrl = relayerUrl;

    const relayerKeyId = toOptionalTrimmedString(rec.relayerKeyId);
    if (relayerKeyId) participant.relayerKeyId = relayerKeyId;

    const verifyingShareB64u = toOptionalTrimmedString(rec.verifyingShareB64u);
    if (verifyingShareB64u) participant.verifyingShareB64u = verifyingShareB64u;

    const shareDerivation = toOptionalTrimmedString(rec.shareDerivation);
    if (
      shareDerivation === 'prf_first_v1'
      || shareDerivation === 'derived_master_secret_v1'
      || shareDerivation === 'kv_random_v1'
      || shareDerivation === 'unknown'
    ) {
      participant.shareDerivation = shareDerivation;
    }

    out.push(participant);
  }

  return out.length ? out : null;
}

export function buildThresholdEd25519Participants2pV1(input: {
  clientParticipantId?: number | null;
  relayerParticipantId?: number | null;
  relayerKeyId: string;
  relayerUrl?: string | null;
  clientVerifyingShareB64u?: string | null;
  relayerVerifyingShareB64u?: string | null;
  clientShareDerivation?: ThresholdEd25519ShareDerivation | null;
  relayerShareDerivation?: ThresholdEd25519ShareDerivation | null;
}): ThresholdEd25519ParticipantV1[] {
  const relayerKeyId = toOptionalTrimmedString(input.relayerKeyId);
  const relayerUrl = toOptionalTrimmedString(input.relayerUrl);
  const clientVerifyingShareB64u = toOptionalTrimmedString(input.clientVerifyingShareB64u);
  const relayerVerifyingShareB64u = toOptionalTrimmedString(input.relayerVerifyingShareB64u);
  const clientParticipantId =
    normalizeThresholdEd25519ParticipantId(input.clientParticipantId) ?? THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID;
  const relayerParticipantId =
    normalizeThresholdEd25519ParticipantId(input.relayerParticipantId) ?? THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID;

  const client: ThresholdEd25519ParticipantV1 = {
    id: clientParticipantId,
    role: 'client',
    ...(clientVerifyingShareB64u ? { verifyingShareB64u: clientVerifyingShareB64u } : {}),
    shareDerivation: input.clientShareDerivation || 'prf_first_v1',
  };

  const relayer: ThresholdEd25519ParticipantV1 = {
    id: relayerParticipantId,
    role: 'relayer',
    ...(relayerUrl ? { relayerUrl } : {}),
    ...(relayerKeyId ? { relayerKeyId } : {}),
    ...(relayerVerifyingShareB64u ? { verifyingShareB64u: relayerVerifyingShareB64u } : {}),
    ...(input.relayerShareDerivation ? { shareDerivation: input.relayerShareDerivation } : {}),
  };

  return [client, relayer];
}
