import type { MinimalNearClient, SignedTransaction } from '../../core/NearClient';
import { ActionType, type ActionArgsWasm, validateActionArgsWasm } from '../../core/types/actions';
import { parseContractExecutionError } from '../core/errors';
import {
  encryptEmailForOutlayer,
  type EmailEncryptionContext,
} from './teeEmail';

export * from './teeEmail';
export * from './zkEmail';

export interface EmailRecoveryServiceDeps {
  relayerAccountId: string;
  relayerPrivateKey: string;
  networkId: string;
  emailDkimVerifierAccountId: string;
  nearClient: MinimalNearClient;
  ensureSignerAndRelayerAccount: () => Promise<void>;
  queueTransaction<T>(fn: () => Promise<T>, label: string): Promise<T>;
  fetchTxContext(accountId: string, publicKey: string): Promise<{ nextNonce: string; blockHash: string }>;
  signWithPrivateKey(input: {
    nearPrivateKey: string;
    signerAccountId: string;
    receiverId: string;
    nonce: string;
    blockHash: string;
    actions: ActionArgsWasm[];
  }): Promise<SignedTransaction>;
  getRelayerPublicKey(): string;
}

export interface EmailRecoveryRequest {
  accountId: string;
  emailBlob: string;
}

export type EmailRecoveryMode = 'zk-email' | 'encrypted' | 'onchain-public';

export interface EmailRecoveryDispatchRequest extends EmailRecoveryRequest {
  explicitMode?: string;
}

export interface EmailRecoveryResult {
  success: boolean;
  transactionHash?: string;
  message?: string;
  error?: string;
}

/**
 * EmailRecoveryService encapsulates DKIM/TEE email recovery logic so it can be
 * refactored into a standalone package in the future. It orchestrates:
 * - Fetching the Outlayer X25519 public key from EmailDKIMVerifier,
 * - Encrypting the raw email with encryptEmailForOutlayer,
 * - Calling request_email_verification_private on the EmailDKIMVerifier contract.
 */
export class EmailRecoveryService {
  private readonly deps: EmailRecoveryServiceDeps;
  private cachedRecipientPk: Uint8Array | null = null;

  constructor(deps: EmailRecoveryServiceDeps) {
    this.deps = deps;
  }

  /**
   * Determine recovery mode (zk-email | encrypted | onchain-public) from:
   * - explicit override (for programmatic callers),
   * - body markers inside the raw email,
   * falling back to tee-private for backwards compatibility.
   */
  private determineRecoveryMode(input: {
    explicitMode?: string;
    emailBlob?: string;
  }): EmailRecoveryMode {
    const normalize = (raw: string | undefined | null): EmailRecoveryMode | null => {
      if (!raw) return null;
      const value = raw.trim().toLowerCase();
      if (value === 'zk-email' || value === 'zk') return 'zk-email';
      if (value === 'encrypted' || value === 'enc' || value === 'tee-private' || value === 'tee') return 'encrypted';
      if (value === 'onchain-public' || value === 'onchain' || value === 'public') return 'onchain-public';
      return null;
    };

    // 1) Explicit override (e.g. from API param)
    const fromExplicit = normalize(input.explicitMode);
    if (fromExplicit) return fromExplicit;

    const raw = input.emailBlob || '';
    if (raw) {
      const lines = raw.split(/\r?\n/);

      // 2) First non-empty body line marker
      let inBody = false;
      for (const line of lines) {
        if (!inBody) {
          if (line.trim() === '') {
            inBody = true;
          }
          continue;
        }
        const trimmed = line.trim();
        if (!trimmed) continue;
        const bodyMode = normalize(trimmed);
        if (bodyMode) return bodyMode;
        const lower = trimmed.toLowerCase();
        if (lower.includes('zk-email')) return 'zk-email';
        if (lower.includes('encrypted') || lower.includes('tee-private')) return 'encrypted';
        if (lower.includes('onchain-public')) return 'onchain-public';
        break; // only inspect first non-empty body line
      }
    }

    // 3) Default to encrypted (DKIM/TEE path)
    return 'encrypted';
  }

  /**
   * Top-level dispatcher for email recovery modes.
   * - Determines the recovery mode from body/overrides.
   * - Routes encrypted → DKIM/TEE flow (requestEncryptedEmailVerification).
   * - Routes onchain-public → pure on-chain EmailRecoverer flow (requestOnchainEmailVerification).
   * - Returns a clear "not implemented" error for zk-email for now.
   */
  async requestEmailRecovery(request: EmailRecoveryDispatchRequest): Promise<EmailRecoveryResult> {
    const mode = this.determineRecoveryMode({
      explicitMode: request.explicitMode,
      emailBlob: request.emailBlob,
    });

    if (mode === 'encrypted') {
      return this.requestEncryptedEmailVerification({
        accountId: request.accountId,
        emailBlob: request.emailBlob,
      });
    }

    if (mode === 'zk-email') {
      return {
        success: false,
        error: 'zk-email recovery mode selected but not implemented yet',
        message: 'zk-email recovery mode selected but not implemented yet',
      };
    }

    // onchain-public
    return this.requestOnchainEmailVerification({
      accountId: request.accountId,
      emailBlob: request.emailBlob,
    });
  }

  /**
   * Fetch and cache the Outlayer X25519 public key used for email encryption.
   */
  private async getOutlayerEmailDkimPublicKey(): Promise<Uint8Array> {
    if (this.cachedRecipientPk) {
      return this.cachedRecipientPk;
    }

    const { nearClient, emailDkimVerifierAccountId } = this.deps;

    const result = await nearClient.view<{ }, unknown>({
      account: emailDkimVerifierAccountId,
      method: 'get_outlayer_encryption_public_key',
      args: {},
    });

    if (typeof result !== 'string' || !result) {
      throw new Error('get_outlayer_encryption_public_key returned an invalid value');
    }

    let bytes: Uint8Array;
    try {
      const decoded = typeof Buffer !== 'undefined'
        ? Buffer.from(result, 'base64')
        : Uint8Array.from(atob(result), c => c.charCodeAt(0));
      bytes = decoded instanceof Uint8Array ? decoded : new Uint8Array(decoded);
    } catch (e) {
      throw new Error(`Failed to decode Outlayer email DKIM public key: ${(e as Error).message}`);
    }

    if (bytes.length !== 32) {
      throw new Error(`Outlayer email DKIM public key must be 32 bytes, got ${bytes.length}`);
    }

    this.cachedRecipientPk = bytes;
    return bytes;
  }

  /**
   * High-level helper for encrypted DKIM-based email verification.
   */
  async requestEncryptedEmailVerification(request: EmailRecoveryRequest): Promise<EmailRecoveryResult> {
    const accountId = (request.accountId || '').trim();
    const emailBlob = request.emailBlob;

    if (!accountId) {
      return {
        success: false,
        error: 'accountId is required',
        message: 'accountId is required',
      };
    }
    if (!emailBlob || typeof emailBlob !== 'string') {
      return {
        success: false,
        error: 'emailBlob (raw email) is required',
        message: 'emailBlob (raw email) is required',
      };
    }

    const {
      relayerAccountId,
      relayerPrivateKey,
      networkId,
      emailDkimVerifierAccountId,
      nearClient,
      ensureSignerAndRelayerAccount,
      queueTransaction,
      fetchTxContext,
      signWithPrivateKey,
      getRelayerPublicKey,
    } = this.deps;

    try {
      await ensureSignerAndRelayerAccount();
    } catch (e: any) {
      const msg = e?.message || 'Failed to initialize relayer account';
      return { success: false, error: msg, message: msg };
    }

    return queueTransaction(async () => {
      try {
        const recipientPk = await this.getOutlayerEmailDkimPublicKey();

        const context: EmailEncryptionContext = {
          account_id: accountId,
          payer_account_id: relayerAccountId,
          network_id: networkId,
        };

        const { envelope } = await encryptEmailForOutlayer({
          emailRaw: emailBlob,
          context,
          recipientPk,
        });

        const contractArgs = {
          payer_account_id: relayerAccountId,
          email_blob: null,
          encrypted_email_blob: envelope,
          params: context,
        };

        const actions: ActionArgsWasm[] = [
          {
            action_type: ActionType.FunctionCall,
            method_name: 'request_email_verification',
            args: JSON.stringify(contractArgs),
            gas: '300000000000000', // 300 TGas
            deposit: '10000000000000000000000', // 0.01 NEAR
          },
        ];
        actions.forEach(validateActionArgsWasm);

        const relayerPublicKey = getRelayerPublicKey();
        const { nextNonce, blockHash } = await fetchTxContext(relayerAccountId, relayerPublicKey);

        const signed = await signWithPrivateKey({
          nearPrivateKey: relayerPrivateKey,
          signerAccountId: relayerAccountId,
          receiverId: emailDkimVerifierAccountId,
          nonce: nextNonce,
          blockHash,
          actions,
        });

        const result = await nearClient.sendTransaction(signed);

        const contractError = parseContractExecutionError(result, emailDkimVerifierAccountId);
        if (contractError) {
          return {
            success: false,
            error: contractError,
            message: contractError,
          };
        }

        return {
          success: true,
          transactionHash: result.transaction.hash,
          message: `Encrypted email verification requested for ${accountId}`,
        };
      } catch (error: any) {
        const msg = error?.message || 'Unknown encrypted email recovery error';
        return {
          success: false,
          error: msg,
          message: msg,
        };
      }
    }, `encrypted email recovery (dkim) for ${accountId}`);
  }

  /**
   * Helper for on-chain/public email recovery:
   * - Calls the per-account EmailRecoverer contract directly with the raw email blob.
   * - No TEE or encrypted blob; relies purely on on-chain verification.
   * - Email contents are made public as parameters onchain
   */
  async requestOnchainEmailVerification(request: EmailRecoveryRequest): Promise<EmailRecoveryResult> {
    const accountId = (request.accountId || '').trim();
    const emailBlob = request.emailBlob;

    if (!accountId) {
      return {
        success: false,
        error: 'accountId is required',
        message: 'accountId is required',
      };
    }
    if (!emailBlob || typeof emailBlob !== 'string') {
      return {
        success: false,
        error: 'emailBlob (raw email) is required',
        message: 'emailBlob (raw email) is required',
      };
    }

    const {
      relayerAccountId,
      relayerPrivateKey,
      nearClient,
      ensureSignerAndRelayerAccount,
      queueTransaction,
      fetchTxContext,
      signWithPrivateKey,
      getRelayerPublicKey,
    } = this.deps;

    try {
      await ensureSignerAndRelayerAccount();
    } catch (e: any) {
      const msg = e?.message || 'Failed to initialize relayer account';
      return { success: false, error: msg, message: msg };
    }

    return queueTransaction(async () => {
      try {
        const contractArgs = {
          email_blob: emailBlob,
        };

        const actions: ActionArgsWasm[] = [
          {
            action_type: ActionType.FunctionCall,
            method_name: 'verify_email_onchain_and_recover',
            args: JSON.stringify(contractArgs),
            gas: '300000000000000', // 300 TGas
            deposit: '10000000000000000000000', // 0.01 NEAR
          },
        ];
        actions.forEach(validateActionArgsWasm);

        const relayerPublicKey = getRelayerPublicKey();
        const { nextNonce, blockHash } = await fetchTxContext(relayerAccountId, relayerPublicKey);

        const signed = await signWithPrivateKey({
          nearPrivateKey: relayerPrivateKey,
          signerAccountId: relayerAccountId,
          receiverId: accountId,
          nonce: nextNonce,
          blockHash,
          actions,
        });

        const result = await nearClient.sendTransaction(signed);

        const contractError = parseContractExecutionError(result, accountId);
        if (contractError) {
          return {
            success: false,
            error: contractError,
            message: contractError,
          };
        }

        return {
          success: true,
          transactionHash: result.transaction.hash,
          message: `On-chain email verification requested for ${accountId}`,
        };
      } catch (error: any) {
        const msg = error?.message || 'Unknown on-chain email recovery error';
        return {
          success: false,
          error: msg,
          message: msg,
        };
      }
    }, `onchain email recovery for ${accountId}`);
  }

}
