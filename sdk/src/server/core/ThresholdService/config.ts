import { base64UrlDecode } from '../../../utils/encoders';
import { toOptionalTrimmedString } from '../../../utils/validation';
import {
  THRESHOLD_ED25519_2P_PARTICIPANT_IDS,
  THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID,
  THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID,
  normalizeThresholdEd25519ParticipantId,
  normalizeThresholdEd25519ParticipantIds,
} from '../../../threshold/participants';

export type ThresholdEd25519ShareMode = 'auto' | 'kv' | 'derived';

export function coerceThresholdEd25519ShareMode(input: unknown): ThresholdEd25519ShareMode {
  const mode = toOptionalTrimmedString(input);
  if (mode === 'kv' || mode === 'derived' || mode === 'auto') return mode;
  return 'auto';
}

export type ThresholdNodeRole = 'participant' | 'coordinator';

export function coerceThresholdNodeRole(input: unknown): ThresholdNodeRole {
  const role = toOptionalTrimmedString(input);
  return role === 'participant' ? 'participant' : 'coordinator';
}

export type ThresholdCoordinatorPeer = {
  id: number;
  relayerUrl: string;
};

export function parseThresholdCoordinatorPeers(input: unknown): ThresholdCoordinatorPeer[] | null {
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
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const rec = item as Record<string, unknown>;
    const id = normalizeThresholdEd25519ParticipantId(rec.id);
    const relayerUrl = toOptionalTrimmedString(rec.relayerUrl)?.replace(/\/+$/, '');
    if (!id || !relayerUrl) return null;
    const key = `${id}:${relayerUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id, relayerUrl });
  }

  out.sort((a, b) => (a.id - b.id) || a.relayerUrl.localeCompare(b.relayerUrl));
  return out.length ? out : null;
}

export function parseThresholdCoordinatorSharedSecretBytes(input: unknown): Uint8Array | null {
  const coordinatorSharedSecretB64u = toOptionalTrimmedString(input);
  if (!coordinatorSharedSecretB64u) return null;

  let decoded: Uint8Array;
  try {
    decoded = base64UrlDecode(coordinatorSharedSecretB64u);
  } catch {
    throw new Error('THRESHOLD_COORDINATOR_SHARED_SECRET_B64U must be valid base64url');
  }
  if (decoded.length !== 32) {
    throw new Error(`THRESHOLD_COORDINATOR_SHARED_SECRET_B64U must decode to 32 bytes, got ${decoded.length}`);
  }
  return decoded;
}

export function validateThresholdEd25519MasterSecretB64u(input: unknown): string | null {
  const masterSecretB64u = toOptionalTrimmedString(input);
  if (!masterSecretB64u) return null;
  const decoded = base64UrlDecode(masterSecretB64u);
  if (decoded.length !== 32) {
    throw new Error(`THRESHOLD_ED25519_MASTER_SECRET_B64U must decode to 32 bytes, got ${decoded.length}`);
  }
  return masterSecretB64u;
}

export function parseThresholdEd25519ParticipantIds2p(input: {
  THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID?: unknown;
  THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID?: unknown;
}): { clientParticipantId: number; relayerParticipantId: number; participantIds2p: number[] } {
  const clientIdRaw = input.THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID;
  const relayerIdRaw = input.THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID;
  const clientId = clientIdRaw === undefined ? null : normalizeThresholdEd25519ParticipantId(clientIdRaw);
  if (clientIdRaw !== undefined && !clientId) {
    throw new Error('THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID must be an integer in [1,65535]');
  }
  const relayerId = relayerIdRaw === undefined ? null : normalizeThresholdEd25519ParticipantId(relayerIdRaw);
  if (relayerIdRaw !== undefined && !relayerId) {
    throw new Error('THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID must be an integer in [1,65535]');
  }

  const clientParticipantId = clientId ?? THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID;
  const relayerParticipantId = relayerId ?? THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID;
  if (clientParticipantId === relayerParticipantId) {
    throw new Error('THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID must differ from THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID');
  }

  const participantIds2p =
    normalizeThresholdEd25519ParticipantIds([clientParticipantId, relayerParticipantId])
    || [...THRESHOLD_ED25519_2P_PARTICIPANT_IDS];

  return { clientParticipantId, relayerParticipantId, participantIds2p };
}
