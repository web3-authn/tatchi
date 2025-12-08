import type { MinimalNearClient, SignedTransaction } from '../../core/NearClient';
import { ActionType, type ActionArgsWasm, validateActionArgsWasm } from '../../core/types/actions';
import { parseContractExecutionError } from '../core/errors';
import {
  encryptEmailForOutlayer,
  type EmailEncryptionContext,
} from './teeEmail';
import {
  extractZkEmailBindingsFromPayload,
  generateZkEmailProofFromPayload,
  normalizeForwardableEmailPayload,
  type ZkEmailProverClientOptions,
} from './zkEmail';

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
  zkEmailProver?: ZkEmailProverClientOptions;
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
 * - Calling request_email_verification on the EmailDKIMVerifier contract.
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
      if (value === 'zk-email' || 'zk') return 'zk-email';
      if (value === 'encrypted' || value === 'tee') return 'encrypted';
      if (value === 'onchain-public' || value === 'onchain') return 'onchain-public';
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
   *
   * Usage from HTTP routes:
   * - Pass the full raw RFC822 email as `emailBlob` (including headers + body).
   * - Optionally include an explicit `explicitMode` override (`'zk-email' | 'encrypted' | 'onchain-public'`).
   * - Otherwise, the first non-empty body line is parsed as a mode hint:
   *   - `"zk-email"` → zk-email prover + `verify_zkemail_and_recover`.
   *   - `"encrypted"` → TEE DKIM encryption + `request_email_verification`.
   *   - `"onchain-public"` → on-chain email recovery (`verify_email_onchain_and_recover`).
   * - If no hint is found, the mode defaults to `'encrypted'`.
   */
  async requestEmailRecovery(request: EmailRecoveryDispatchRequest): Promise<EmailRecoveryResult> {
    const mode = this.determineRecoveryMode({
      explicitMode: request.explicitMode,
      emailBlob: request.emailBlob,
    });
    console.log('[email-recovery] requestEmailRecovery mode selected', {
      mode,
      accountId: request.accountId,
    });

    if (mode === 'encrypted') {
      return this.requestEncryptedEmailVerification({
        accountId: request.accountId,
        emailBlob: request.emailBlob,
      });
    }

    if (mode === 'zk-email') {
      return this.requestZkEmailVerification({
        accountId: request.accountId,
        emailBlob: request.emailBlob,
      });
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
      console.error('[email-recovery] encrypted ensureSignerAndRelayerAccount failed', {
        accountId,
        error: msg,
      });
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
          console.warn('[email-recovery] encrypted contract error', {
            accountId,
            error: contractError,
          });
          return {
            success: false,
            error: contractError,
            message: contractError,
          };
        }

        console.log('[email-recovery] encrypted recovery success', {
          accountId,
          txHash: result.transaction.hash,
        });

        return {
          success: true,
          transactionHash: result.transaction.hash,
          message: `Encrypted email verification requested for ${accountId}`,
        };
      } catch (error: any) {
        const msg = error?.message || 'Unknown encrypted email recovery error';
        console.error('[email-recovery] encrypted recovery error', {
          accountId,
          error: msg,
        });
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
      console.error('[email-recovery] onchain ensureSignerAndRelayerAccount failed', {
        accountId,
        error: msg,
      });
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
          console.warn('[email-recovery] onchain contract error', {
            accountId,
            error: contractError,
          });
          return {
            success: false,
            error: contractError,
            message: contractError,
          };
        }

        console.log('[email-recovery] onchain recovery success', {
          accountId,
          txHash: result.transaction.hash,
        });

        return {
          success: true,
          transactionHash: result.transaction.hash,
          message: `On-chain email verification requested for ${accountId}`,
        };
      } catch (error: any) {
        const msg = error?.message || 'Unknown on-chain email recovery error';
        console.error('[email-recovery] onchain recovery error', {
          accountId,
          error: msg,
        });
        return {
          success: false,
          error: msg,
          message: msg,
        };
      }
    }, `onchain email recovery for ${accountId}`);
  }

  /**
   * Helper for zk-email recovery:
   * - Calls external zk-email prover with the raw email blob to obtain (proof, publicInputs).
   * - Extracts subject/header bindings (account_id, new_public_key, from_email, timestamp).
   * - Calls the per-account EmailRecoverer contract with verify_zkemail_and_recover.
   */
  async requestZkEmailVerification(request: EmailRecoveryRequest): Promise<EmailRecoveryResult> {
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
      zkEmailProver,
    } = this.deps;

    if (!zkEmailProver || !zkEmailProver.baseUrl) {
      console.error('[email-recovery] zk-email missing prover configuration', { accountId });
      return {
        success: false,
        error: 'zk-email prover configuration is missing',
        message: 'zk-email prover configuration is missing',
      };
    }

    try {
      await ensureSignerAndRelayerAccount();
    } catch (e: any) {
      const msg = e?.message || 'Failed to initialize relayer account';
      console.error('[email-recovery] zk-email ensureSignerAndRelayerAccount failed', {
        accountId,
        error: msg,
      });
      return { success: false, error: msg, message: msg };
    }

    return queueTransaction(async () => {
      try {
        const normalized = normalizeForwardableEmailPayload({
          from: '',
          to: '',
          headers: {},
          raw: emailBlob,
        });
        if (!normalized.ok) {
          return {
            success: false,
            error: 'invalid_email_payload',
            message: normalized.message || 'Invalid email payload for zk-email recovery',
          };
        }

        const bindings = extractZkEmailBindingsFromPayload(normalized.payload);
        if (!bindings) {
          console.warn('[email-recovery] zk-email bindings parse error', { accountId });
          return {
            success: false,
            error: 'zkemail_parse_error_bindings',
            message: 'Failed to parse accountId/new_public_key/from_email/timestamp from email',
          };
        }

        if (bindings.accountId !== accountId) {
          console.warn('[email-recovery] zk-email account mismatch', {
            accountIdRequested: accountId,
            accountIdSubject: bindings.accountId,
          });
          return {
            success: false,
            error: 'zkemail_account_mismatch',
            message: 'accountId in subject does not match requested accountId',
          };
        }

        const proofResult = await generateZkEmailProofFromPayload(normalized.payload, zkEmailProver);

        const contractArgs = {
          proof: proofResult.proof,
          public_inputs: proofResult.publicInputs,
          account_id: bindings.accountId,
          new_public_key: bindings.newPublicKey,
          from_email: bindings.fromEmail,
          timestamp: bindings.timestamp,
        };

        const actions: ActionArgsWasm[] = [
          {
            action_type: ActionType.FunctionCall,
            method_name: 'verify_zkemail_and_recover',
            args: JSON.stringify(contractArgs),
            gas: '300000000000000',
            deposit: '10000000000000000000000',
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
          console.warn('[email-recovery] zk-email contract error', {
            accountId,
            error: contractError,
          });
          return {
            success: false,
            error: contractError,
            message: contractError,
          };
        }

        console.log('[email-recovery] zk-email recovery success', {
          accountId,
          txHash: result.transaction.hash,
        });

        return {
          success: true,
          transactionHash: result.transaction.hash,
          message: `ZK-email recovery requested for ${accountId}`,
        };
      } catch (error: any) {
        const code = (error && typeof error.code === 'string') ? error.code as string : undefined;
        let errorCode = 'zkemail_unknown_error';
        let msg = error?.message || 'Unknown zk-email recovery error';

        if (code === 'prover_timeout') {
          errorCode = 'zkemail_prover_timeout';
          msg = 'ZK-email prover request timed out';
        } else if (code === 'prover_http_error') {
          errorCode = 'zkemail_prover_http_error';
          // Keep underlying message if present for debugging
          msg = error?.message || 'ZK-email prover HTTP error';
        } else if (code === 'prover_network_error') {
          errorCode = 'zkemail_prover_network_error';
          msg = error?.message || 'ZK-email prover network error';
        } else if (code === 'missing_raw_email') {
          errorCode = 'zkemail_missing_raw_email';
          msg = 'raw email contents are required to generate a zk-email proof';
        }

        console.error('[email-recovery] zk-email recovery error', {
          accountId,
          errorCode,
          errorMessage: msg,
        });

        return {
          success: false,
          error: errorCode,
          message: msg,
        };
      }
    }, `zk-email recovery for ${accountId}`);
  }

}
