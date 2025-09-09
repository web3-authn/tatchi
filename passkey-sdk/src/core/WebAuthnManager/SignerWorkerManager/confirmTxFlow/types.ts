import { VRFChallenge } from '@/core/types/vrf-worker';
import { TransactionInputWasm } from '../../../types';
import { ConfirmationConfig } from '../../../types';
import { TransactionContext } from '../../../types/rpc';
import { RpcCallPayload } from '../../../types/signer-worker';

// === SECURE CONFIRM TYPES ===

export interface SecureConfirmData {
  requestId: string;
  summary: string | object;
  tx_signing_requests: TransactionInputWasm[]; // Array of TransactionInputWasm objects
  intentDigest: string;
  rpcCall: RpcCallPayload; // RPC parameters for NEAR operations and VRF generation
  confirmationConfig?: ConfirmationConfig; // Confirmation configuration from WASM worker
  isRegistration: boolean;
}

export interface ConfirmationSummaryAction {
  to: string;
  totalAmount: string;
}

export interface ConfirmationSummaryRegistration {
  type: string;
  nearAccountId: string;
  deviceNumber: number;
  contractId: string;
  deterministicVrfPublicKey: string;
}


export enum SecureConfirmMessageType {
  PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD = 'PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD',
  USER_PASSKEY_CONFIRM_RESPONSE = 'USER_PASSKEY_CONFIRM_RESPONSE',
}

export interface SecureConfirmMessage {
  type: SecureConfirmMessageType;
  data: SecureConfirmData;
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
  isRegistration?: boolean;
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
