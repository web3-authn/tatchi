// Threshold-related defaults that are shared between client + server code.
// Keep this separate from `sdk/src/core/defaultConfigs.ts` so we can avoid
// pulling unrelated client defaults into server bundles (and vice versa).

// Default threshold participant identifiers (2P FROST).
// These are intentionally exported as standalone constants so apps can reuse them when wiring
// threshold signing across client + server environments.
export const THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID = 1 as const;
export const THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID = 2 as const;
export const THRESHOLD_ED25519_2P_PARTICIPANT_IDS = [
  THRESHOLD_ED25519_CLIENT_PARTICIPANT_ID,
  THRESHOLD_ED25519_RELAYER_PARTICIPANT_ID,
] as const;

