// === SECURE CONFIRM TYPES ===

export interface SecureConfirmData {
  requestId: string;
  summary: string | object;
  tx_signing_requests?: any[]; // Array of TransactionPayload objects
  intentDigest?: string;
  nearAccountId?: string; // Account ID for credential lookup
  vrfChallenge?: any; // VRF challenge for credential generation
  confirmationConfig?: any; // Confirmation configuration from WASM worker
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

// Worker bridge types
export interface WorkerConfirmationRequest {
  requestId: string;
  summary: any;
  digest: string;
  txSigningRequestsJson: string | undefined;
}

export interface WorkerConfirmationResponse {
  requestId: string;
  intentDigest?: string;
  confirmed: boolean;
  credential?: any;
  prfOutput?: string;
}
