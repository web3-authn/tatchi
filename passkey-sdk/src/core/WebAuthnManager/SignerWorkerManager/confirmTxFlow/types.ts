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

export interface SecureConfirmDecision {
  requestId: string;
  intentDigest?: string;
  confirmed: boolean;
  credential?: SerializableCredential; // Serialized WebAuthn credential
  prfOutput?: string; // Base64url-encoded PRF output
  vrfChallenge?: VRFChallenge; // VRF challenge generated during confirmation
  transactionContext?: TransactionContext; // NEAR data fetched during confirmation
  // This is a private field used to close the confirmation modal
  _confirmHandle?: { close: (confirmed: boolean) => void };
  error?: string;
}

export interface TransactionSummary {
  totalAmount?: string;
  method?: string;
  intentDigest?: string;
  receiverId?: string;
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
  prf_output?: string;
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

// V2 request envelope
export interface SecureConfirmRequest<TPayload = unknown, TSummary = unknown> {
  schemaVersion: 2;
  requestId: string;
  type: SecureConfirmationType;
  summary: TSummary;
  payload: TPayload;
  confirmationConfig?: ConfirmationConfig;
  // Optional intent digest to echo back in responses for flows that
  // do not have a tx-centric payload (e.g., registration/link flows)
  intentDigest?: string;
}

// V2 payloads
export interface SignTransactionPayload {
  txSigningRequests: TransactionInputWasm[];
  intentDigest: string;
  rpcCall: RpcCallPayload;
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
}

// V2 summaries (render-oriented)
export interface TxSummary { totalAmount?: string; method?: string; receiverId?: string }
export interface RegistrationSummary { nearAccountId: string; deviceNumber?: number; contractId?: string }
export interface ExportSummary { operation: 'Export Private Key'; accountId: string; publicKey: string; warning: string }
export interface Nep413Summary { operation: 'Sign NEP-413 Message'; message: string; recipient: string; accountId: string }

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
export type LocalOnlySecureConfirmRequest =
  | (SecureConfirmRequest<DecryptPrivateKeyWithPrfPayload> & { type: SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF })
  | (SecureConfirmRequest<ShowSecurePrivateKeyUiPayload> & { type: SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI });

export type RegistrationSecureConfirmRequest =
  | (SecureConfirmRequest<RegisterAccountPayload> & { type: SecureConfirmationType.REGISTER_ACCOUNT })
  | (SecureConfirmRequest<RegisterAccountPayload> & { type: SecureConfirmationType.LINK_DEVICE });

export type SigningSecureConfirmRequest =
  | (SecureConfirmRequest<SignTransactionPayload> & { type: SecureConfirmationType.SIGN_TRANSACTION })
  | (SecureConfirmRequest<SignNep413Payload> & { type: SecureConfirmationType.SIGN_NEP413_MESSAGE });

export type KnownSecureConfirmRequest =
  | LocalOnlySecureConfirmRequest
  | RegistrationSecureConfirmRequest
  | SigningSecureConfirmRequest;
