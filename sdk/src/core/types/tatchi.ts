import type { FinalExecutionOutcome } from '@near-js/types';
import type { EncryptedVRFKeypair } from './vrf-worker';
import type { AccountId } from './accountIds';
import type { SignedTransaction } from '../NearClient';
import type { AuthenticatorOptions } from './authenticatorOptions';
import type { ClientUserData } from '../IndexedDBManager/passkeyClientDB';
import type { SignerMode, WasmSignedDelegate } from './signer-worker';

//////////////////////////////////
/// Result Types
//////////////////////////////////

export interface LoginState {
  isLoggedIn: boolean;
  nearAccountId: AccountId | null;
  publicKey: string | null;
  userData: ClientUserData | null;
  vrfActive: boolean;
  vrfSessionDuration?: number;
}

export interface RegistrationResult {
  success: boolean;
  error?: string;
  clientNearPublicKey?: string | null;
  nearAccountId?: AccountId;
  transactionId?: string | null;
  vrfRegistration?: {
    success: boolean;
    vrfPublicKey?: string;
    encryptedVrfKeypair?: EncryptedVRFKeypair;
    contractVerified?: boolean;
    error?: string;
  };
}

export interface LoginResult {
  success: boolean;
  error?: string;
  loggedInNearAccountId?: string;
  clientNearPublicKey?: string | null;
  nearAccountId?: AccountId;
  // Present when session.kind === 'jwt' and verification succeeded
  jwt?: string;
}

export interface SigningSessionStatus {
  sessionId: string;
  status: 'active' | 'exhausted' | 'expired' | 'not_found';
  remainingUses?: number;
  expiresAtMs?: number;
  createdAtMs?: number;
}

export interface LoginAndCreateSessionResult extends LoginResult {
  signingSession?: SigningSessionStatus;
}

export interface LoginSession {
  login: LoginState;
  signingSession: SigningSessionStatus | null;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  // Optional structured error details when available (e.g., NEAR RPC error payload)
  errorDetails?: unknown;
  transactionId?: string;
  result?: FinalExecutionOutcome;
}

export interface SignTransactionResult {
  signedTransaction: SignedTransaction;
  nearAccountId: string;
  logs?: string[];
}

export interface GetRecentLoginsResult {
  accountIds: string[],
  lastUsedAccount: {
    nearAccountId: AccountId,
    deviceNumber: number,
  } | null
}

export interface SignDelegateActionResult {
  hash: string;
  signedDelegate: WasmSignedDelegate;
  nearAccountId: string;
  logs?: string[];
}

export interface DelegateRelayResult {
  ok: boolean;
  relayerTxHash?: string;
  status?: string;
  outcome?: unknown;
  error?: string;
}

export interface SignAndSendDelegateActionResult {
  signResult: SignDelegateActionResult;
  relayResult: DelegateRelayResult;
}

export type EmailRecoveryContracts = {
  emailRecovererGlobalContract: string;
  zkEmailVerifierContract: string;
  emailDkimVerifierContract: string;
};

//////////////////////////////////
/// TatchiPasskey Configuration
//////////////////////////////////

export interface TatchiConfigsInput {
  nearRpcUrl?: string;
  nearNetwork?: 'testnet' | 'mainnet';
  contractId?: 'w3a-v1.testnet' | string;
  nearExplorerUrl?: string; // NEAR Explorer URL for transaction links
  /**
   * Initial theme used to seed the SDK + wallet UI before any user preference exists.
   * This is intended to prevent a flash-of-unstyled-theme (FOUC) at startup.
   */
  initialTheme?: 'dark' | 'light';
  /**
   * @deprecated Use `initialTheme` instead. This is kept for backward compatibility.
   */
  walletTheme?: 'dark' | 'light';
  /**
   * Default signing mode used by higher-level convenience helpers and UI wrappers when a per-call
   * `signerMode` is not explicitly provided.
   *
   * Defaults to `{ mode: 'local-signer' }` for backwards compatibility.
   *
   */
  signerMode?: SignerMode;
  /**
   * Defaults for VRF-owned warm signing sessions minted by `loginAndCreateSession()`.
   * These can be overridden per-call via `LoginHooksOptions.signingSession`.
   */
  signingSessionDefaults?: {
    ttlMs?: number;
    remainingUses?: number;
  };
  // Iframe Wallet configuration (when using a separate wallet origin)
  iframeWallet?: {
    walletOrigin?: string; // e.g., https://wallet.example.com
    walletServicePath?: string; // defaults to '/wallet-service'
    // SDK assets base used by the parent app to tell the wallet
    // where to load embedded bundles from.
    sdkBasePath?: string; // defaults to '/sdk'
    // Force WebAuthn rpId to a base domain so credentials work across subdomains
    // Example: rpIdOverride = 'example.localhost' usable from wallet.example.localhost
    rpIdOverride?: string;
  };
  // Relay Server is used to create new NEAR accounts
  relayer?: {
    // accountId: string;
    url?: string;
    /**
     * Relative path on the relayer used for delegate action execution.
     * Defaults to '/signed-delegate'.
     */
    delegateActionRoute?: string;
    emailRecovery?: {
      minBalanceYocto?: string;
      pollingIntervalMs?: number;
      maxPollingDurationMs?: number;
      pendingTtlMs?: number;
      mailtoAddress?: string;
    };
  }
  // authenticator options for registrations
  authenticatorOptions?: AuthenticatorOptions;
  // Shamir 3-pass configuration (optional)
  // used for auto-unlocking VRF keypairs used for Web3authn challenges
  vrfWorkerConfigs?: {
    shamir3pass?: {
      p?: string; // Shamir's P prime number (public parameter)
      relayServerUrl?: string; // Relay server URL, defaults to relayer.url
      applyServerLockRoute?: string; // Apply server lock route
      removeServerLockRoute?: string; // Remove server lock route
    }
  }
  // Email recovery contract identifiers
  emailRecoveryContracts?: Partial<EmailRecoveryContracts>;
}

/**
 * Resolved, internal config shape used by SDK classes after merging defaults and validation.
 * All fields that the SDK relies on at runtime are non-optional here.
 */
export interface TatchiConfigs {
  nearRpcUrl: string;
  nearNetwork: 'testnet' | 'mainnet';
  contractId: 'w3a-v1.testnet' | string;
  nearExplorerUrl?: string;
  /**
   * Initial theme used to seed the SDK + wallet UI before any user preference exists.
   * This is intended to prevent a flash-of-unstyled-theme (FOUC) at startup.
   */
  initialTheme?: 'dark' | 'light';
  /**
   * @deprecated Use `initialTheme` instead. This is kept for backward compatibility.
   */
  walletTheme?: 'dark' | 'light';
  signerMode: SignerMode;
  signingSessionDefaults: {
    ttlMs: number;
    remainingUses: number;
  };
  iframeWallet?: {
    walletOrigin?: string;
    walletServicePath: string;
    sdkBasePath: string;
    rpIdOverride?: string;
  };
  relayer: {
    url: string;
    delegateActionRoute: string;
    emailRecovery: {
      minBalanceYocto: string;
      pollingIntervalMs: number;
      maxPollingDurationMs: number;
      pendingTtlMs: number;
      mailtoAddress: string;
    };
  };
  authenticatorOptions?: AuthenticatorOptions;
  vrfWorkerConfigs: {
    shamir3pass: {
      p: string;
      relayServerUrl: string;
      applyServerLockRoute: string;
      removeServerLockRoute: string;
    };
  };
  emailRecoveryContracts: EmailRecoveryContracts;
}

// === TRANSACTION TYPES ===
export interface TransactionParams {
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas?: string;
  deposit?: string;
}
