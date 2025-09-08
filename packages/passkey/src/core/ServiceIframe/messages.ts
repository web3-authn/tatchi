// Typed RPC messages for the wallet service iframe channel

export type ServiceProtocolVersion = '1.0.0';

export type ParentToChildType =
  | 'PING'
  | 'SET_CONFIG'
  | 'SET_ACCOUNT'
  | 'REQUEST_REGISTER'
  | 'REQUEST_SIGN'
  // Handler-aligned request names (SignerWorkerManager/handlers)
  | 'REQUEST_signTransactionsWithActions'
  | 'REQUEST_signVerifyAndRegisterUser'
  | 'REQUEST_decryptPrivateKeyWithPrf'
  | 'REQUEST_deriveNearKeypairAndEncrypt'
  | 'REQUEST_recoverKeypairFromPasskey'
  | 'REQUEST_signTransactionWithKeyPair'
  | 'REQUEST_signNep413Message'
  | 'REQUEST_IMPORT_KEYS'
  | 'DB_GET_USER'
  | 'DB_GET_LAST_USER'
  | 'DB_SET_LAST_USER'
  | 'DB_GET_PREFERENCES'
  | 'DB_UPDATE_PREFERENCES'
  | 'DB_GET_CONFIRMATION_CONFIG'
  | 'DB_GET_THEME'
  | 'DB_SET_THEME'
  | 'DB_TOGGLE_THEME'
  | 'DB_GET_AUTHENTICATORS'
  | 'DB_STORE_AUTHENTICATOR';

export type ChildToParentType =
  | 'READY'
  | 'PONG'
  | 'PROGRESS'
  | 'REGISTER_RESULT'
  | 'SIGN_RESULT'
  | 'NEP413_RESULT'
  | 'DB_RESULT'
  | 'ERROR';

export interface RpcEnvelope<T extends string = string, P = unknown> {
  type: T;
  requestId?: string;
  payload?: P;
}

// ===== Payloads =====

export interface ReadyPayload {
  protocolVersion: ServiceProtocolVersion;
}

export interface SetConfigPayload {
  theme?: 'dark' | 'light';
  language?: string;
  // Optional PasskeyManagerConfigs for wallet host
  nearRpcUrl?: string;
  nearNetwork?: 'testnet' | 'mainnet';
  contractId?: string;
  relayer?: { initialUseRelayer: boolean; accountId: string; url: string };
  vrfWorkerConfigs?: Record<string, unknown>;
}

export interface SetAccountPayload {
  nearAccountId: string;
  deviceNumber?: number;
}

export interface RequestRegisterPayload {
  nearAccountId: string;
  // additional options may be added later
}

export interface TransactionInputLite {
  receiverId: string;
  actions: unknown[]; // keep generic; child normalizes shape
}

export interface RequestSignPayload {
  nearAccountId: string;
  txSigningRequests: TransactionInputLite[];
  options?: Record<string, unknown>;
}

// Handler-aligned payloads (can evolve to match exact TS types)
export interface RequestSignTransactionsWithActionsPayload extends RequestSignPayload {
  rpcCall?: Record<string, unknown>;
  confirmationConfig?: Record<string, unknown>;
}

export interface RequestSignVerifyAndRegisterUserPayload {
  nearAccountId: string;
  deviceNumber?: number;
  vrfChallenge?: unknown;
  options?: Record<string, unknown>;
}

export interface RequestDeriveNearKeypairAndEncryptPayload {
  nearAccountId: string;
  credential: unknown; // PublicKeyCredential serialized
  options?: {
    vrfChallenge?: unknown;
    deterministicVrfPublicKey?: string;
    contractId?: string;
    nonce?: string;
    blockHash?: string;
    authenticatorOptions?: Record<string, unknown>;
  };
}

export interface RequestRecoverKeypairFromPasskeyPayload {
  authenticationCredential: unknown; // PublicKeyCredential (assertion)
  accountIdHint?: string;
}

export interface ProgressPayload {
  step: number;
  phase: string;
  status: 'progress' | 'success' | 'error';
  message?: string;
  data?: unknown;
}

export interface RegisterResultPayload {
  success: boolean;
  error?: string;
  // WebAuthnManager.signVerifyAndRegisterUser result fields
  verified?: boolean;
  registrationInfo?: unknown;
  logs?: string[];
  signedTransaction?: unknown; // SignedTransaction
  preSignedDeleteTransaction?: unknown | null; // SignedTransaction | null
}

export interface SignResultPayload {
  success: boolean;
  error?: string;
  // Signed results (try to mirror WebAuthnManager.signTransactionsWithActions return array)
  signedTransactions?: unknown[];
}

export interface DbResultPayload {
  ok: boolean;
  error?: string;
  result?: unknown;
}

export interface Nep413ResultPayload {
  success: boolean;
  accountId?: string;
  publicKey?: string;
  signature?: string;
  state?: string | null;
  error?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export type ParentToChildEnvelope =
  | RpcEnvelope<'PING'>
  | RpcEnvelope<'SET_CONFIG', SetConfigPayload>
  | RpcEnvelope<'SET_ACCOUNT', SetAccountPayload>
  | RpcEnvelope<'REQUEST_REGISTER', RequestRegisterPayload>
  | RpcEnvelope<'REQUEST_SIGN', RequestSignPayload>
  | RpcEnvelope<'REQUEST_signTransactionsWithActions', RequestSignTransactionsWithActionsPayload>
  | RpcEnvelope<'REQUEST_signVerifyAndRegisterUser', RequestSignVerifyAndRegisterUserPayload>
  | RpcEnvelope<'REQUEST_decryptPrivateKeyWithPrf', { nearAccountId: string }>
  | RpcEnvelope<'REQUEST_deriveNearKeypairAndEncrypt', RequestDeriveNearKeypairAndEncryptPayload>
  | RpcEnvelope<'REQUEST_recoverKeypairFromPasskey', RequestRecoverKeypairFromPasskeyPayload>
  | RpcEnvelope<'REQUEST_signTransactionWithKeyPair', unknown>
  | RpcEnvelope<'REQUEST_signNep413Message', unknown>
  | RpcEnvelope<'REQUEST_IMPORT_KEYS', unknown>
  | RpcEnvelope<'DB_GET_USER', { nearAccountId: string }>
  | RpcEnvelope<'DB_GET_LAST_USER'>
  | RpcEnvelope<'DB_SET_LAST_USER', { nearAccountId: string; deviceNumber?: number }>
  | RpcEnvelope<'DB_GET_PREFERENCES', { nearAccountId: string }>
  | RpcEnvelope<'DB_UPDATE_PREFERENCES', { nearAccountId: string; patch: Record<string, unknown> }>
  | RpcEnvelope<'DB_GET_CONFIRMATION_CONFIG', { nearAccountId: string }>
  | RpcEnvelope<'DB_GET_THEME', { nearAccountId: string }>
  | RpcEnvelope<'DB_SET_THEME', { nearAccountId: string; theme: 'dark' | 'light' }>
  | RpcEnvelope<'DB_TOGGLE_THEME', { nearAccountId: string }>
  | RpcEnvelope<'DB_GET_AUTHENTICATORS', { nearAccountId: string }>
  | RpcEnvelope<'DB_STORE_AUTHENTICATOR', { record: Record<string, unknown> }>;

export type ChildToParentEnvelope =
  | RpcEnvelope<'READY', ReadyPayload>
  | RpcEnvelope<'PONG'>
  | RpcEnvelope<'PROGRESS', ProgressPayload>
  | RpcEnvelope<'REGISTER_RESULT', RegisterResultPayload>
  | RpcEnvelope<'SIGN_RESULT', SignResultPayload>
  | RpcEnvelope<'NEP413_RESULT', Nep413ResultPayload>
  | RpcEnvelope<'DB_RESULT', DbResultPayload>
  | RpcEnvelope<'ERROR', ErrorPayload>;
