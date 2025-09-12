import { VRFChallenge } from '@/core/types/vrf-worker';
import { TransactionInputWasm } from '../../../types';
import { ConfirmationConfig } from '../../../types';
import { TransactionContext } from '../../../types/rpc';
import { RpcCallPayload } from '../../../types/signer-worker';

// === SECURE CONFIRM TYPES (V2) ===

export enum SecureConfirmMessageType {
  PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD = 'PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD',
  USER_PASSKEY_CONFIRM_RESPONSE = 'USER_PASSKEY_CONFIRM_RESPONSE',
}

export interface SecureConfirmDecision {
  requestId: string;
  intentDigest?: string;
  confirmed: boolean;
  credential?: any; // Serialized WebAuthn credential
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
  vrfChallenge?: any;
  summary?: any;
}

// Payload to return to Rust WASM is snake_case
export interface WorkerConfirmationResponse {
  request_id: string;
  intent_digest?: string;
  confirmed: boolean;
  credential?: any;
  prf_output?: string;
  vrf_challenge?: VRFChallenge;     // VRF challenge generated during confirmation
  transaction_context?: TransactionContext; // NEAR data fetched during confirmation
  error?: string;
}

// ===== V2 REFACTOR TYPES (non-breaking additions) =====

export enum SecureConfirmationType {
  SIGN_TRANSACTION = 'signTransaction',
  REGISTER_ACCOUNT = 'registerAccount',
  LINK_DEVICE = 'linkDevice',
  DECRYPT_PRIVATE_KEY_WITH_PRF = 'decryptPrivateKeyWithPrf',
  SIGN_NEP413_MESSAGE = 'signNep413Message',
}

// V2 request envelope (preferred for new call sites)
export interface SecureConfirmRequest<TPayload = any, TSummary = any> {
  schemaVersion: 2;
  requestId: string;
  type: SecureConfirmationType;
  summary: TSummary;
  payload: TPayload;
  confirmationConfig?: ConfirmationConfig;
  // Optional intent digest to echo back in responses for flows that
  // do not have a tx-centric payload (e.g., registration/link flows)
  intentDigest?: string;
  // Indicates where the call was initiated from, relative to the page hosting
  // the PasskeyManager runtime.
  // - 'parent': default; typical programmatic calls from outside any embedded UI
  // - 'iframe': initiated by an embedded iframe control (e.g., IframeButtonHost)
  // This is advisory and used only for runtime UI decisions/logging on the main thread.
  invokedFrom?: 'iframe' | 'parent';
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
export function isSecureConfirmRequestV2(x: any): x is SecureConfirmRequest {
  return !!x && typeof x === 'object' && x.schemaVersion === 2 && typeof x.type === 'string' && typeof x.requestId === 'string';
}
