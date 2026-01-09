
import type { AccountId } from './accountIds';
import type { ConfirmationConfig } from './signer-worker';
import type { EmailRecoverySSEEvent, EventCallback, AfterCall } from './sdkSentEvents';
import type { EncryptedVRFKeypair, ServerEncryptedVrfKeypair, VRFChallenge } from './vrf-worker';
import type { WebAuthnRegistrationCredential } from './webauthn';
import type { PendingStore } from '../EmailRecovery';
import type { StoreUserDataInput } from '../IndexedDBManager/passkeyClientDB';

export enum EmailRecoveryErrorCode {
  REGISTRATION_NOT_VERIFIED = 'EMAIL_RECOVERY_REGISTRATION_NOT_VERIFIED',
  VRF_CHALLENGE_EXPIRED = 'EMAIL_RECOVERY_VRF_CHALLENGE_EXPIRED',
}

export function generateEmailRecoveryRequestId(): string {
  // 6-character A–Z0–9 identifier, suitable for short-lived correlation.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = 6;
  const bytes = new Uint8Array(length);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export class EmailRecoveryError extends Error {
  public readonly code: EmailRecoveryErrorCode;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: EmailRecoveryErrorCode, context?: Record<string, unknown>) {
    super(message);
    this.name = 'EmailRecoveryError';
    this.code = code;
    this.context = context;
  }
}

export type PendingEmailRecoveryStatus =
  | 'awaiting-email'
  | 'awaiting-add-key'
  | 'finalizing'
  | 'complete'
  | 'error';

export type PendingEmailRecovery = {
  accountId: AccountId;
  deviceNumber: number;
  nearPublicKey: string;
  requestId: string;
  encryptedVrfKeypair: EncryptedVRFKeypair;
  serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
  vrfPublicKey: string;
  credential: WebAuthnRegistrationCredential;
  vrfChallenge?: VRFChallenge;
  createdAt: number;
  status: PendingEmailRecoveryStatus;
};

export interface EmailRecoveryFlowOptions {
  onEvent?: EventCallback<EmailRecoverySSEEvent>;
  onError?: (error: Error) => void;
  afterCall?: AfterCall<void>;
  pendingStore?: PendingStore;
  confirmerText?: { title?: string; body?: string };
  confirmationConfig?: Partial<ConfirmationConfig>;
}

export type PollTickResult<T> = { done: false } | { done: true; value: T };

export type PollUntilResult<T> =
  | { status: 'completed'; value: T; elapsedMs: number; pollCount: number }
  | { status: 'timedOut'; elapsedMs: number; pollCount: number }
  | { status: 'cancelled'; elapsedMs: number; pollCount: number };

export type VerificationOutcome =
  | { outcome: 'verified' }
  | { outcome: 'failed'; errorMessage: string };

export type AutoLoginResult =
  | { success: true; method: 'shamir' | 'touchid' }
  | { success: false; reason: string };

export type StoreUserDataPayload = StoreUserDataInput;

export type AccountViewLike = {
  amount: bigint | string;
  locked: bigint | string;
  storage_usage: number | bigint;
};

export type CollectedRecoveryCredential = {
  credential: WebAuthnRegistrationCredential;
  vrfChallenge?: VRFChallenge;
};

export type DerivedRecoveryKeys = {
  encryptedVrfKeypair: EncryptedVRFKeypair;
  serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
  vrfPublicKey: string;
  nearPublicKey: string;
};
