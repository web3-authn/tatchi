import { VRFChallenge } from '@/core/types/vrf-worker';
import { TransactionPayload } from '../../../types/signer-worker';
import { ConfirmationConfig } from '../../../types';

// === SECURE CONFIRM TYPES ===

export interface SecureConfirmData {
  requestId: string;
  summary: string | object;
  tx_signing_requests: TransactionPayload[]; // Array of TransactionPayload objects
  intentDigest: string;
  nearAccountId: string; // Account ID for credential lookup
  vrfChallenge: VRFChallenge; // VRF challenge for credential generation
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
  // This is a private field used to close the confirmation modal
  _confirmHandle?: { close: (confirmed: boolean) => void };
  error?: string;
}

export interface TransactionSummary {
  totalAmount?: string;
  method?: string;
  fingerprint?: string;
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
  error?: string;
}
