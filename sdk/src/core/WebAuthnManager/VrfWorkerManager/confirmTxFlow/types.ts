import { VRFChallenge } from '@/core/types/vrf-worker';
import { TransactionInputWasm } from '../../../types';
import { ConfirmationConfig } from '../../../types';
import { TransactionContext } from '../../../types/rpc';
import { RpcCallPayload } from '../../../types/signer-worker';
import { WebAuthnAuthenticationCredential, WebAuthnRegistrationCredential } from '../../../types/webauthn';
import { isObject, isString } from '../../../WalletIframe/validation';

// === SECURE CONFIRM TYPES (V2) ===

export enum SecureConfirmMessageType {
  PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD = 'PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD',
  USER_PASSKEY_CONFIRM_RESPONSE = 'USER_PASSKEY_CONFIRM_RESPONSE',
}

/**
 * Type-level guardrail: these secrets must never appear in main-thread
 * request/response envelopes. WrapKeySeed is delivered only over the dedicated
 * VRF→Signer MessagePort, and PRF outputs should only exist inside credentials.
 */
export type ForbiddenMainThreadSecrets = {
  prfOutput?: never;
  prf_output?: never;
  wrapKeySeed?: never;
  wrapKeySalt?: never;
  vrf_sk?: never;
  prfKey?: never;
};

export interface SecureConfirmDecision extends ForbiddenMainThreadSecrets {
  requestId: string;
  intentDigest?: string;
  confirmed: boolean;
  credential?: SerializableCredential; // Serialized WebAuthn credential
  vrfChallenge?: VRFChallenge; // VRF challenge generated during confirmation
  transactionContext?: TransactionContext; // NEAR data fetched during confirmation
  // This is a private field used to close the confirmation modal
  _confirmHandle?: { close: (confirmed: boolean) => void };
  error?: string;
}

export interface TransactionSummary {
  totalAmount?: string;
  title?: string;
  body?: string;
  method?: string;
  intentDigest?: string;
  receiverId?: string;
  type?: string;
  delegate?: {
    senderId?: string;
    receiverId?: string;
    nonce?: string;
    maxBlockHeight?: string;
  };
  registrationDetails?: {
    nearAccountId: string;
    deviceNumber: number;
    deterministicVrfPublicKey?: string;
  };
  vrfChallenge?: VRFChallenge;
  summary?: unknown;
}

// Payload to return to Rust WASM is snake_case
export interface WorkerConfirmationResponse {
  request_id: string;
  intent_digest?: string;
  confirmed: boolean;
  credential?: SerializableCredential;
  vrf_challenge?: VRFChallenge;     // VRF challenge generated during confirmation
  transaction_context?: TransactionContext; // NEAR data fetched during confirmation
  error?: string;
}

// ===== V2 MESSAGE TYPES =====

export enum SecureConfirmationType {
  SIGN_TRANSACTION = 'signTransaction',
  REGISTER_ACCOUNT = 'registerAccount',
  LINK_DEVICE = 'linkDevice',
  DECRYPT_PRIVATE_KEY_WITH_PRF = 'decryptPrivateKeyWithPrf',
  SIGN_NEP413_MESSAGE = 'signNep413Message',
  SHOW_SECURE_PRIVATE_KEY_UI = 'showSecurePrivateKeyUi',
}

export type SigningAuthMode = 'webauthn' | 'warmSession';

// V2 summaries (render-oriented / UI hints)
export interface TxSummary { totalAmount?: string; method?: string; receiverId?: string }
export interface RegistrationSummary {
  nearAccountId: string;
  deviceNumber?: number;
  contractId?: string;
  title?: string;
  body?: string;
}
export type ExportOperation = 'Export Private Key' | 'Decrypt Private Key';
export interface ExportSummary { operation: ExportOperation; accountId: string; publicKey: string; warning: string }
export interface Nep413Summary { operation: 'Sign NEP-413 Message'; message: string; recipient: string; accountId: string }

// V2 request envelope
export type SecureConfirmPayloadByType = {
  [SecureConfirmationType.SIGN_TRANSACTION]: SignTransactionPayload;
  [SecureConfirmationType.REGISTER_ACCOUNT]: RegisterAccountPayload;
  [SecureConfirmationType.LINK_DEVICE]: RegisterAccountPayload;
  [SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF]: DecryptPrivateKeyWithPrfPayload;
  [SecureConfirmationType.SIGN_NEP413_MESSAGE]: SignNep413Payload;
  [SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI]: ShowSecurePrivateKeyUiPayload;
};

export type SecureConfirmSummaryByType = {
  [SecureConfirmationType.SIGN_TRANSACTION]: TransactionSummary;
  [SecureConfirmationType.REGISTER_ACCOUNT]: RegistrationSummary;
  [SecureConfirmationType.LINK_DEVICE]: RegistrationSummary;
  [SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF]: ExportSummary;
  [SecureConfirmationType.SIGN_NEP413_MESSAGE]: TransactionSummary;
  [SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI]: ExportSummary;
};

export type SecureConfirmPayload = SecureConfirmPayloadByType[keyof SecureConfirmPayloadByType];
export type SecureConfirmSummary = SecureConfirmSummaryByType[keyof SecureConfirmSummaryByType];

export interface SecureConfirmRequest<TPayload = SecureConfirmPayload, TSummary = SecureConfirmSummary> {
  schemaVersion: 2;
  requestId: string;
  type: SecureConfirmationType;
  summary: TSummary;
  payload: TPayload;
  // Allow partial override from callers; effective config is computed later
  confirmationConfig?: Partial<ConfirmationConfig>;
  // Optional intent digest to echo back in responses for flows that
  // do not have a tx-centric payload (e.g., registration/link flows)
  intentDigest?: string;
}

// V2 payloads
export interface SignTransactionPayload {
  txSigningRequests: TransactionInputWasm[];
  intentDigest: string;
  rpcCall: RpcCallPayload;
  /**
   * Optional base64url-encoded 32-byte digest to bind a relayer session policy into the VRF input hash (v4+ only).
   * When present, it will be forwarded to the VRF worker for inclusion in VRF input derivation.
   */
  sessionPolicyDigest32?: string;
  /**
   * Controls whether confirmTxFlow should collect a WebAuthn credential.
   * - `webauthn`: prompt TouchID/FaceID and derive WrapKeySeed from PRF.first_auth.
   * - `warmSession`: skip WebAuthn and dispense the existing VRF session key to the signer worker.
   */
  signingAuthMode?: SigningAuthMode;
}

export interface RegisterAccountPayload {
  nearAccountId: string;
  deviceNumber?: number;
  rpcCall: RpcCallPayload;
}

export interface DecryptPrivateKeyWithPrfPayload {
  nearAccountId: string;
  publicKey: string;
}

export interface ShowSecurePrivateKeyUiPayload {
  nearAccountId: string;
  publicKey: string;
  privateKey: string;
  variant?: 'drawer' | 'modal';
  theme?: 'dark' | 'light';
}

export interface SignNep413Payload {
  nearAccountId: string;
  message: string;
  recipient: string;
  /**
   * Optional base64url-encoded 32-byte digest to bind a relayer session policy into the VRF input hash (v4+ only).
   */
  sessionPolicyDigest32?: string;
  /**
   * Optional contract verification context for VRF gating.
   * When provided, VRF Rust can call `verify_authentication_response` on-chain
   * before deriving and dispensing session keys.
   */
  contractId?: string;
  /**
   * Optional NEAR RPC URL for contract verification (single URL or failover list).
   */
  nearRpcUrl?: string;
  /**
   * Controls whether confirmTxFlow should collect a WebAuthn credential for this signing intent.
   * See `SignTransactionPayload.signingAuthMode`.
   */
  signingAuthMode?: SigningAuthMode;
}

// Type guards
export function isSecureConfirmRequestV2(x: unknown): x is SecureConfirmRequest {
  return isObject(x)
    && (x as { schemaVersion?: unknown }).schemaVersion === 2
    && isString((x as { type?: unknown }).type)
    && isString((x as { requestId?: unknown }).requestId);
}

// Serialized WebAuthn credential (authentication or registration)
export type SerializableCredential = WebAuthnAuthenticationCredential | WebAuthnRegistrationCredential;

// Discriminated unions to bind `type` to payload shape
export type SecureConfirmRequestByType<TType extends SecureConfirmationType> =
  SecureConfirmRequest<SecureConfirmPayloadByType[TType], SecureConfirmSummaryByType[TType]> & { type: TType };

export type LocalOnlySecureConfirmRequest =
  | SecureConfirmRequestByType<SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF>
  | SecureConfirmRequestByType<SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI>;

export type RegistrationSecureConfirmRequest =
  | SecureConfirmRequestByType<SecureConfirmationType.REGISTER_ACCOUNT>
  | SecureConfirmRequestByType<SecureConfirmationType.LINK_DEVICE>;

export type SigningSecureConfirmRequest =
  | SecureConfirmRequestByType<SecureConfirmationType.SIGN_TRANSACTION>
  | SecureConfirmRequestByType<SecureConfirmationType.SIGN_NEP413_MESSAGE>;

export type KnownSecureConfirmRequest =
  | LocalOnlySecureConfirmRequest
  | RegistrationSecureConfirmRequest
  | SigningSecureConfirmRequest;
