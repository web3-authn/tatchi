
// Typed RPC messages for the wallet service iframe channel (TatchiPasskey-first)
import { AuthenticatorOptions } from '@/server';
import type { WalletUIRegistry } from '../host/iframe-lit-element-registry';
import type { EmailRecoveryContracts } from '../../types/tatchi';
import { SignedTransaction } from '../../NearClient';
import {
  ActionArgs,
  TransactionInput,
  LoginHooksOptions,
  ActionHooksOptions,
  RegistrationHooksOptions,
  SignAndSendTransactionHooksOptions,
  ScanAndLinkDeviceOptionsDevice1
} from '../../types';
import { type DeviceLinkingQRData } from '../../types/linkDevice';
import type { DelegateActionInput } from '../../types/delegate';
import type { ConfirmationConfig } from '../../types/signer-worker';

export type WalletProtocolVersion = '1.0.0';

export type ParentToChildType =
  | 'PING'
  | 'PM_SET_CONFIG'
  | 'PM_CANCEL'
  // TatchiPasskey API surface
  | 'PM_REGISTER'
  | 'PM_LOGIN'
  | 'PM_LOGOUT'
  | 'PM_GET_LOGIN_SESSION'
  // Local persistence helpers (wallet-origin IndexedDB)
  | 'PM_SET_DERIVED_ADDRESS'
  | 'PM_GET_DERIVED_ADDRESS_RECORD'
  | 'PM_GET_DERIVED_ADDRESS'
  | 'PM_GET_RECOVERY_EMAILS'
  | 'PM_SET_RECOVERY_EMAILS'
  | 'PM_SIGN_TXS_WITH_ACTIONS'
  | 'PM_SIGN_AND_SEND_TXS'
  | 'PM_SEND_TRANSACTION'
  | 'PM_EXECUTE_ACTION'
  | 'PM_SIGN_DELEGATE_ACTION'
  | 'PM_SIGN_NEP413'
  | 'PM_EXPORT_NEAR_KEYPAIR_UI'
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
  | 'PM_RECOVER_ACCOUNT_FLOW'
  // Email recovery flow
  | 'PM_START_EMAIL_RECOVERY'
  | 'PM_FINALIZE_EMAIL_RECOVERY';

export type ChildToParentType =
  | 'READY'
  | 'PONG'
  | 'PROGRESS'
  | 'PREFERENCES_CHANGED'
  | 'PM_RESULT'
  | 'ERROR';

export interface RpcEnvelope<T extends string = string, P = unknown> {
  type: T;
  requestId?: string;
  payload?: P;
  options?: {
    onProgress?(payload: ProgressPayload): void;
    sticky?: boolean;
  }
}

// ===== Payloads =====

export interface ReadyPayload {
  protocolVersion: WalletProtocolVersion;
}

export interface PreferencesChangedPayload {
  nearAccountId: string | null;
  confirmationConfig: ConfirmationConfig;
  updatedAt: number;
}

export interface PMSetConfigPayload {
  theme?: 'dark' | 'light';
  // TatchiConfigs subset for wallet host
  nearRpcUrl?: string;
  nearNetwork?: 'testnet' | 'mainnet';
  contractId?: string;
  nearExplorerUrl?: string;
  relayer?: {
    initialUseRelayer?: boolean;
    url: string;
  };
  vrfWorkerConfigs?: Record<string, unknown>;
  rpIdOverride?: string;
  authenticatorOptions?: AuthenticatorOptions;
  emailRecoveryContracts?: Partial<EmailRecoveryContracts>;
  // Absolute base URL for SDK Lit component assets (e.g., https://app.example.com/sdk/)
  assetsBaseUrl?: string;
  // Optional: register wallet-host UI components (Lit tags + bindings)
  uiRegistry?: WalletUIRegistry;
}

export interface PMCancelPayload {
  requestId?: string; // when omitted, host may attempt best-effort global cancel (close UIs)
}

export interface PMRegisterPayload {
  nearAccountId: string;
  uiMode?: 'modal' | 'drawer';
  // Optional per-call confirmation override
  confirmationConfig?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface PMLoginPayload {
  nearAccountId: string;
  options?: Record<string, unknown>;
}

export interface PMSignTxsPayload {
  nearAccountId: string;
  transactions: TransactionInput[];
  options?: Record<string, unknown>;
}

export interface PMSignAndSendTxsPayload {
  nearAccountId: string;
  transactions: TransactionInput[];
  options?: {
    // Keep only serializable fields; functions are bridged via PROGRESS
    waitUntil?: 'NONE' | 'INCLUDED' | 'INCLUDED_FINAL' | 'EXECUTED' | 'FINAL' | 'EXECUTED_OPTIMISTIC';
    executionWait?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface PMSendTxPayload {
  signedTransaction: SignedTransaction; // SignedTransaction-like
  options?: Record<string, unknown>;
}

export interface PMExecuteActionPayload {
  nearAccountId: string;
  receiverId: string;
  actionArgs: ActionArgs | ActionArgs[];
  options?: Record<string, unknown>;
}

export interface PMSignDelegateActionPayload {
  nearAccountId: string;
  delegate: DelegateActionInput;
  options?: Record<string, unknown>;
}

export interface PMSignNep413Payload {
  nearAccountId: string;
  params: { message: string; recipient: string; state?: string };
  options?: Record<string, unknown>;
}

export interface PMExportNearKeypairPayload { nearAccountId: string }
export interface PMExportNearKeypairUiPayload { nearAccountId: string; variant?: 'modal' | 'drawer'; theme?: 'dark' | 'light' }

export interface PMSetConfirmBehaviorPayload { behavior: 'requireClick' | 'autoProceed'; nearAccountId?: string }

export interface PMSetConfirmationConfigPayload { config: Record<string, unknown>; nearAccountId?: string }

export interface PMGetLoginSessionPayload { nearAccountId?: string }

export interface PMSetThemePayload { theme: 'dark' | 'light' }

export interface PMHasPasskeyPayload { nearAccountId: string }

export interface PMViewAccessKeysPayload { accountId: string }

export interface PMDeleteDeviceKeyPayload { accountId: string; publicKeyToDelete: string }

export interface PMStartEmailRecoveryPayload {
  accountId: string;
  recoveryEmail: string;
  options?: {
    confirmerText?: { title?: string; body?: string };
    confirmationConfig?: Record<string, unknown>;
  };
}

export interface PMFinalizeEmailRecoveryPayload {
  accountId: string;
  nearPublicKey?: string;
}

export interface PMSetDerivedAddressPayload {
  nearAccountId: string;
  args: { contractId: string; path: string; address: string };
}

export interface PMGetDerivedAddressRecordPayload {
  nearAccountId: string;
  args: { contractId: string; path: string };
}

export interface PMGetDerivedAddressPayload {
  nearAccountId: string;
  args: { contractId: string; path: string };
}

export interface PMGetRecoveryEmailsPayload {
  nearAccountId: string;
}

export interface PMSetRecoveryEmailsPayload {
  nearAccountId: string;
  recoveryEmails: string[];
  options?: {
    waitUntil?: unknown;
    confirmationConfig?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

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
  | RpcEnvelope<'PM_GET_LOGIN_SESSION', PMGetLoginSessionPayload>
  | RpcEnvelope<'PM_SET_DERIVED_ADDRESS', PMSetDerivedAddressPayload>
  | RpcEnvelope<'PM_GET_DERIVED_ADDRESS_RECORD', PMGetDerivedAddressRecordPayload>
  | RpcEnvelope<'PM_GET_DERIVED_ADDRESS', PMGetDerivedAddressPayload>
  | RpcEnvelope<'PM_GET_RECOVERY_EMAILS', PMGetRecoveryEmailsPayload>
  | RpcEnvelope<'PM_SET_RECOVERY_EMAILS', PMSetRecoveryEmailsPayload>
  | RpcEnvelope<'PM_SIGN_TXS_WITH_ACTIONS', PMSignTxsPayload>
  | RpcEnvelope<'PM_SIGN_AND_SEND_TXS', PMSignAndSendTxsPayload>
  | RpcEnvelope<'PM_SEND_TRANSACTION', PMSendTxPayload>
  | RpcEnvelope<'PM_EXECUTE_ACTION', PMExecuteActionPayload>
  | RpcEnvelope<'PM_SIGN_DELEGATE_ACTION', PMSignDelegateActionPayload>
  | RpcEnvelope<'PM_SIGN_NEP413', PMSignNep413Payload>
  | RpcEnvelope<'PM_EXPORT_NEAR_KEYPAIR_UI', PMExportNearKeypairUiPayload>
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
      qrData: DeviceLinkingQRData;
      fundingAmount: string;
      options?: {
        confirmationConfig?: Record<string, unknown>;
        confirmerText?: { title?: string; body?: string };
      };
    }>
  | RpcEnvelope<'PM_START_DEVICE2_LINKING_FLOW', {
      ui?: 'modal' | 'inline';
      cameraId?: string;
      options?: {
        confirmationConfig?: Record<string, unknown>;
        confirmerText?: { title?: string; body?: string };
      };
    }>
  | RpcEnvelope<'PM_STOP_DEVICE2_LINKING_FLOW'>
  | RpcEnvelope<'PM_RECOVER_ACCOUNT_FLOW', { accountId?: string }>
  | RpcEnvelope<'PM_START_EMAIL_RECOVERY', PMStartEmailRecoveryPayload>
  | RpcEnvelope<'PM_FINALIZE_EMAIL_RECOVERY', PMFinalizeEmailRecoveryPayload>;

export type ChildToParentEnvelope =
  | RpcEnvelope<'READY', ReadyPayload>
  | RpcEnvelope<'PONG'>
  | RpcEnvelope<'PROGRESS', ProgressPayload>
  | RpcEnvelope<'PREFERENCES_CHANGED', PreferencesChangedPayload>
  | RpcEnvelope<'PM_RESULT', PMResultPayload>
  | RpcEnvelope<'ERROR', ErrorPayload>;
