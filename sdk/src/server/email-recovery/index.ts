import { ActionType, type ActionArgsWasm, validateActionArgsWasm } from '../../core/types/actions';
import { parseContractExecutionError } from '../core/errors';
import {
  buildForwardablePayloadFromRawEmail,
  extractZkEmailBindingsFromPayload,
  generateZkEmailProofFromPayload,
  normalizeForwardableEmailPayload,
} from './zkEmail';
import { extractRecoveryModeFromBody, normalizeRecoveryMode } from './emailParsers';
import { encryptEmailForOutlayer, type EmailEncryptionContext } from './emailEncryptor';
import type {
  EmailRecoveryDispatchRequest,
  EmailRecoveryMode,
  EmailRecoveryRequest,
  EmailRecoveryResult,
  EmailRecoveryServiceDeps,
} from './types';

export * from './emailEncryptor';
export * from './zkEmail';
export * from './testHelpers';
export * from './types';

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
    return (
      normalizeRecoveryMode(input.explicitMode) ??
      extractRecoveryModeFromBody(input.emailBlob) ??
      'tee-encrypted'
    );
  }

	  /**
	   * Top-level dispatcher for email recovery modes.
	   *
	   * Usage from HTTP routes:
	   * - Pass the full raw RFC822 email as `emailBlob` (including headers + body).
	   * - Optionally include an explicit `explicitMode` override (`'zk-email' | 'tee-encrypted' | 'onchain-public'`).
	   * - Otherwise, the first non-empty body line is parsed as a mode hint:
	   *   - `"zk-email"` → zk-email prover + per-account `verify_zkemail_and_recover`.
	   *   - `"tee-encrypted"` (or legacy `"encrypted"`) → per-account EmailRecoverer encrypted path (`verify_encrypted_email_and_recover`).
	   *   - `"onchain-public"` → currently routed to the same per-account encrypted path for backwards compatibility.
	   * - If no hint is found, the mode defaults to `'tee-encrypted'`.
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

    switch (mode) {
      case 'tee-encrypted':
        return this.verifyEncryptedEmailAndRecover({
          accountId: request.accountId,
          emailBlob: request.emailBlob,
        });
      case 'zk-email':
        return this.verifyZkemailAndRecover({
          accountId: request.accountId,
          emailBlob: request.emailBlob,
        });
      case 'onchain-public':
        // Use the same encrypted/TEE path via per-account EmailRecoverer.
        return this.verifyEncryptedEmailAndRecover({
          accountId: request.accountId,
          emailBlob: request.emailBlob,
        });
      default:
        // Fallback to the TEE-encrypted path for forwards compatibility.
        return this.verifyEncryptedEmailAndRecover({
          accountId: request.accountId,
          emailBlob: request.emailBlob,
        });
    }
  }

  /**
   * Fetch and cache the Outlayer X25519 public key used for email encryption.
   */
  private async getOutlayerEmailDkimPublicKey(): Promise<Uint8Array> {
    if (this.cachedRecipientPk) {
      return this.cachedRecipientPk;
    }

    const { nearClient, emailDkimVerifierAccountId } = this.deps;

    const result = await nearClient.view<{}, unknown>({
      account: emailDkimVerifierAccountId,
      method: 'get_outlayer_encryption_public_key',
      args: {},
    });

    if (typeof result !== 'string' || !result) {
      throw new Error('Outlayer encryption public key is not configured on EmailDkimVerifier');
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
   * Helper for encrypted DKIM-based email recovery:
   * - Encrypts the raw email blob for the Outlayer worker.
   * - Calls the per-account EmailRecoverer contract's
   *   `verify_encrypted_email_and_recover` entrypoint on the user's account.
   *
   * The per-account EmailRecoverer then delegates to the global
   * EmailDKIMVerifier (TEE path), which stores a VerificationResult keyed by
   * request_id. The frontend polls EmailDKIMVerifier::get_verification_result(request_id)
   * to observe success/failure.
   */
  async verifyEncryptedEmailAndRecover(request: EmailRecoveryRequest): Promise<EmailRecoveryResult> {
    const accountId = (request.accountId || '').trim();
    const emailBlob = request.emailBlob;

    if (!accountId) {
      let errMsg = 'accountId is required';
      return { success: false, error: errMsg, message: errMsg };
    }
    if (!emailBlob || typeof emailBlob !== 'string') {
      let errMsg = 'emailBlob (raw email) is required';
      return { success: false, error: errMsg, message: errMsg };
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
        // Encrypt the email for Outlayer using the global DKIM verifier's
        // X25519 public key, then call the per-account EmailRecoverer
        // `verify_encrypted_email_and_recover` entrypoint.
        const recipientPk = await this.getOutlayerEmailDkimPublicKey();
        console.log('[email-recovery] encrypted using Outlayer public key', {
          accountId,
          outlayer_pk_bytes: Array.from(recipientPk),
        });

        // NOTE: The exact ORDER of the fields must be alphabetized:
        // `context` is bound into the ChaCha20-Poly1305 AAD
        // so order of context matters when decrypting email in the Outlayer worker.
        // This context is also forwarded by the per-account EmailRecoverer into
        // EmailDKIMVerifier::request_email_verification so the Outlayer worker
        // sees the same JSON object for AEAD.
        const aeadContext: EmailEncryptionContext = {
          account_id: accountId,
          network_id: networkId,
          payer_account_id: relayerAccountId,
        };

        const { envelope } = await encryptEmailForOutlayer({
          emailRaw: emailBlob,
          aeadContext,
          recipientPk,
        });

        console.log('[email-recovery] encrypted email envelope metadata', {
          accountId,
          aeadContext,
          envelope: {
            version: envelope.version,
            ephemeral_pub_len: envelope.ephemeral_pub?.length ?? 0,
            nonce_len: envelope.nonce?.length ?? 0,
            ciphertext_len: envelope.ciphertext?.length ?? 0,
          },
        });

        const contractArgs = {
          encrypted_email_blob: envelope,
          aead_context: aeadContext,
        };

        const actions: ActionArgsWasm[] = [
          {
            action_type: ActionType.FunctionCall,
            method_name: 'verify_encrypted_email_and_recover',
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
   * Legacy helper for plaintext/on-chain DKIM email verification + account recovery.
   * This path is deprecated in favor of the encrypted TEE path via
   * `verifyEncryptedEmailAndRecover` and is no longer used by
   * `requestEmailRecovery`.
   */
  async verifyEmailOnchainAndRecover(request: EmailRecoveryRequest): Promise<EmailRecoveryResult> {
    const accountId = (request.accountId || '').trim();
    const emailBlob = request.emailBlob;

    if (!accountId) {
      let errMsg = 'accountId is required';
      return { success: false, error: errMsg, message: errMsg };
    }
    if (!emailBlob || typeof emailBlob !== 'string') {
      let errMsg = 'emailBlob (raw email) is required';
      return { success: false, error: errMsg, message: errMsg };
    }

    const {
      relayerAccountId,
      relayerPrivateKey,
      ensureSignerAndRelayerAccount,
      queueTransaction,
      fetchTxContext,
      signWithPrivateKey,
      getRelayerPublicKey,
      nearClient,
    } = this.deps;

    try {
      await ensureSignerAndRelayerAccount();
    } catch (e: any) {
      const msg = e?.message || 'Failed to initialize relayer account';
      return { success: false, error: msg, message: msg };
    }

    return queueTransaction(async () => {
      try {
        const actions: ActionArgsWasm[] = [
          {
            action_type: ActionType.FunctionCall,
            method_name: 'verify_email_onchain_and_recover',
            args: JSON.stringify({
              email_blob: emailBlob,
            }),
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

  /**
   * Helper for zk-email recovery:
   * - Calls external zk-email prover with the raw email blob to obtain (proof, publicInputs).
   * - Extracts subject/header bindings (account_id, new_public_key, from_email, timestamp).
   * - Calls the per-account EmailRecoverer contract with verify_zkemail_and_recover.
   */
  async verifyZkemailAndRecover(request: EmailRecoveryRequest): Promise<EmailRecoveryResult> {
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
        const forwardable = buildForwardablePayloadFromRawEmail(emailBlob);
        const normalized = normalizeForwardableEmailPayload(forwardable);
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
