import type { AfterCall, EventCallback } from './sdkSentEvents';
import type { AccountId } from './accountIds';

export enum ExtensionMigrationStep {
  IDLE = 'extension-migration-idle',
  PRECHECKS = 'extension-migration-prechecks',
  REGISTER_EXTENSION_CREDENTIAL = 'extension-migration-register-extension-credential',
  LINK_ON_CHAIN = 'extension-migration-link-on-chain',
  CLEANUP = 'extension-migration-cleanup',
  COMPLETE = 'extension-migration-complete',
  ERROR = 'extension-migration-error',
}

export enum ExtensionMigrationStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  ERROR = 'error',
}

export type ExtensionMigrationEvent = {
  step: ExtensionMigrationStep;
  status: 'progress' | 'success' | 'error';
  message?: string;
  data?: Record<string, unknown>;
};

export interface ExtensionMigrationState {
  status: ExtensionMigrationStatus;
  step: ExtensionMigrationStep;
  accountId?: AccountId | null;
  startedAt?: number;
  updatedAt?: number;
  message?: string;
  error?: string;
}

export interface ExtensionMigrationOptions {
  onEvent?: EventCallback<ExtensionMigrationEvent>;
  onError?: (error: Error) => void;
  afterCall?: AfterCall<ExtensionMigrationResult>;
  cleanup?: {
    /**
     * Best-effort on-chain removal of the old web-wallet key.
     * Requires `oldPublicKey` unless it can be inferred safely.
     */
    removeOldKey?: boolean;
    /**
     * Old web-wallet public key to remove (ed25519:<...>).
     */
    oldPublicKey?: string;
    /**
     * Best-effort wipe of web-wallet origin data after successful migration.
     */
    wipeWebWallet?: boolean;
  };
}

export interface ExtensionMigrationResult {
  success: boolean;
  state: ExtensionMigrationState;
  message?: string;
}
