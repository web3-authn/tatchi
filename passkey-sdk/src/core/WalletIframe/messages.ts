
// Typed RPC messages for the wallet service iframe channel (PasskeyManager-first)
import type {
  RegistrationResult,
  VerifyAndSignTransactionResult,
  LoginResult,
  ActionResult,
  LoginState,
} from '../types/passkeyManager';

export type WalletProtocolVersion = '1.0.0';

export type ParentToChildType =
  | 'PING'
  | 'PM_SET_CONFIG'
  | 'PM_CANCEL'
  // PasskeyManager API surface
  | 'PM_REGISTER'
  | 'PM_LOGIN'
  | 'PM_LOGOUT'
  | 'PM_GET_LOGIN_STATE'
  | 'PM_SIGN_TXS_WITH_ACTIONS'
  | 'PM_SIGN_AND_SEND_TXS'
  | 'PM_SEND_TRANSACTION'
  | 'PM_EXECUTE_ACTION'
  | 'PM_SIGN_NEP413'
  | 'PM_EXPORT_NEAR_KEYPAIR'
  | 'PM_GET_RECENT_LOGINS'
  | 'PM_PREFETCH_BLOCKHEIGHT'
  | 'PM_SET_CONFIRM_BEHAVIOR'
  | 'PM_SET_CONFIRMATION_CONFIG'
  | 'PM_GET_CONFIRMATION_CONFIG'
  | 'PM_SET_THEME'
  | 'PM_HAS_PASSKEY'
  | 'PM_VIEW_ACCESS_KEYS'
  | 'PM_DELETE_DEVICE_KEY'
  // Device linking (both sides into iframe)
  | 'PM_LINK_DEVICE_WITH_SCANNED_QR_DATA' // Device1: Scan QR in parent, execute AddKey in iframe
  | 'PM_START_DEVICE2_LINKING_FLOW'     // Device2: Generate QR + poll, render UI in iframe
  | 'PM_STOP_DEVICE2_LINKING_FLOW'      // Device2: Stop/cancel current UI flow
  // Account recovery flow
  | 'PM_RECOVER_ACCOUNT_FLOW';

export type ChildToParentType =
  | 'READY'
  | 'PONG'
  | 'PROGRESS'
  | 'PM_RESULT'
  | 'ERROR';

export interface RpcEnvelope<T extends string = string, P = unknown> {
  type: T;
  requestId?: string;
  payload?: P;
}

// ===== Payloads =====

export interface ReadyPayload {
  protocolVersion: WalletProtocolVersion;
}

export interface PMSetConfigPayload {
  theme?: 'dark' | 'light';
  // PasskeyManagerConfigs subset for wallet host
  nearRpcUrl?: string;
  nearNetwork?: 'testnet' | 'mainnet';
  contractId?: string;
  relayer?: { initialUseRelayer?: boolean; accountId: string; url: string };
  vrfWorkerConfigs?: Record<string, unknown>;
  rpIdOverride?: string;
  // Absolute base URL for SDK Lit component assets (e.g., https://app.example.com/sdk/)
  assetsBaseUrl?: string;
}

export interface PMCancelPayload {
  requestId?: string; // when omitted, host may attempt best-effort global cancel (close UIs)
}

export interface TransactionInputLite {
  receiverId: string;
  actions: unknown[];
}

export interface PMRegisterPayload {
  nearAccountId: string;
  options?: Record<string, unknown>;
  uiMode?: 'modal' | 'drawer';
}

export interface PMLoginPayload {
  nearAccountId: string;
  options?: Record<string, unknown>;
}

export interface PMSignTxsPayload {
  nearAccountId: string;
  transactions: TransactionInputLite[];
  options?: Record<string, unknown>;
}

export interface PMSignAndSendTxsPayload {
  nearAccountId: string;
  transactions: TransactionInputLite[];
  options?: {
    // Keep only serializable fields; functions are bridged via PROGRESS
    waitUntil?: 'NONE' | 'INCLUDED' | 'INCLUDED_FINAL' | 'EXECUTED' | 'FINAL' | 'EXECUTED_OPTIMISTIC';
    executeSequentially?: boolean;
    [key: string]: unknown;
  };
}

export interface PMSendTxPayload {
  signedTransaction: unknown; // SignedTransaction-like POJO
  options?: Record<string, unknown>;
}

export interface PMExecuteActionPayload {
  nearAccountId: string;
  receiverId: string;
  actionArgs: unknown | unknown[];
  options?: Record<string, unknown>;
}

export interface PMSignNep413Payload {
  nearAccountId: string;
  params: { message: string; recipient: string; state?: string };
  options?: Record<string, unknown>;
}

export interface PMExportNearKeypairPayload { nearAccountId: string }

export interface PMSetConfirmBehaviorPayload { behavior: 'requireClick' | 'autoProceed'; nearAccountId?: string }

export interface PMSetConfirmationConfigPayload { config: Record<string, unknown>; nearAccountId?: string }

export interface PMGetLoginStatePayload { nearAccountId?: string }

export interface PMSetThemePayload { theme: 'dark' | 'light' }

export interface PMHasPasskeyPayload { nearAccountId: string }

export interface PMViewAccessKeysPayload { accountId: string }

export interface PMDeleteDeviceKeyPayload { accountId: string; publicKeyToDelete: string }

export interface ProgressPayload {
  step: number;
  phase: string;
  status: 'progress' | 'success' | 'error';
  message?: string;
  data?: unknown;
}

export interface PMResultPayload {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export type ParentToChildEnvelope =
  | RpcEnvelope<'PING'>
  | RpcEnvelope<'PM_SET_CONFIG', PMSetConfigPayload>
  | RpcEnvelope<'PM_CANCEL', PMCancelPayload>
  | RpcEnvelope<'PM_REGISTER', PMRegisterPayload>
  | RpcEnvelope<'PM_LOGIN', PMLoginPayload>
  | RpcEnvelope<'PM_LOGOUT'>
  | RpcEnvelope<'PM_GET_LOGIN_STATE', PMGetLoginStatePayload>
  | RpcEnvelope<'PM_SIGN_TXS_WITH_ACTIONS', PMSignTxsPayload>
  | RpcEnvelope<'PM_SIGN_AND_SEND_TXS', PMSignAndSendTxsPayload>
  | RpcEnvelope<'PM_SEND_TRANSACTION', PMSendTxPayload>
  | RpcEnvelope<'PM_EXECUTE_ACTION', PMExecuteActionPayload>
  | RpcEnvelope<'PM_SIGN_NEP413', PMSignNep413Payload>
  | RpcEnvelope<'PM_EXPORT_NEAR_KEYPAIR', PMExportNearKeypairPayload>
  | RpcEnvelope<'PM_GET_RECENT_LOGINS'>
  | RpcEnvelope<'PM_PREFETCH_BLOCKHEIGHT'>
  | RpcEnvelope<'PM_SET_CONFIRM_BEHAVIOR', PMSetConfirmBehaviorPayload>
  | RpcEnvelope<'PM_SET_CONFIRMATION_CONFIG', PMSetConfirmationConfigPayload>
  | RpcEnvelope<'PM_GET_CONFIRMATION_CONFIG'>
  | RpcEnvelope<'PM_SET_THEME', PMSetThemePayload>
  | RpcEnvelope<'PM_HAS_PASSKEY', PMHasPasskeyPayload>
  | RpcEnvelope<'PM_VIEW_ACCESS_KEYS', PMViewAccessKeysPayload>
  | RpcEnvelope<'PM_DELETE_DEVICE_KEY', PMDeleteDeviceKeyPayload>
  // Device linking
  | RpcEnvelope<'PM_LINK_DEVICE_WITH_SCANNED_QR_DATA', {
      qrData: import('../types/linkDevice').DeviceLinkingQRData;
      fundingAmount: string;
    }>
  | RpcEnvelope<'PM_START_DEVICE2_LINKING_FLOW', {
      accountId?: string; // optional; when omitted, host discovers via polling
      ui?: 'modal' | 'inline';
    }>
  | RpcEnvelope<'PM_STOP_DEVICE2_LINKING_FLOW'>
  | RpcEnvelope<'PM_RECOVER_ACCOUNT_FLOW', { accountId?: string; options?: any }>;

export type ChildToParentEnvelope =
  | RpcEnvelope<'READY', ReadyPayload>
  | RpcEnvelope<'PONG'>
  | RpcEnvelope<'PROGRESS', ProgressPayload>
  | RpcEnvelope<'PM_RESULT', PMResultPayload>
  | RpcEnvelope<'ERROR', ErrorPayload>;
