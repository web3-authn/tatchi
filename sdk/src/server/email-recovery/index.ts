import type { ActionArgsWasm } from '../../core/types/actions';
import { ActionType, validateActionArgsWasm } from '../../core/types/actions';
import { parseContractExecutionError } from '../core/errors';
import { buildForwardablePayloadFromRawEmail, extractZkEmailBindingsFromPayload, generateZkEmailProofFromPayload, normalizeForwardableEmailPayload } from './zkEmail';
import { extractRecoveryModeFromBody, normalizeRecoveryMode } from './emailParsers';
import { encryptEmailForOutlayer } from './emailEncryptor';
import { buildEncryptedEmailRecoveryActions, buildOnchainEmailRecoveryActions, buildZkEmailRecoveryActions, sendEmailRecoveryTransaction, getOutlayerEncryptionPublicKey } from './rpcCalls';
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
 * EmailRecoveryService encapsulates email recovery logic for the relayer.
 *
 * It currently orchestrates:
 * - Fetching and caching the Outlayer X25519 public key from the global EmailDKIMVerifier,
 * - Encrypting raw RFC822 emails with encryptEmailForOutlayer, binding an AEAD context
 *   `{ account_id, network_id, payer_account_id }`,
 * - Calling the per-account EmailRecoverer contract with:
 *   - `verify_encrypted_email_and_recover(encrypted_email_blob, aead_context)` for DKIM/TEE,
 *   - `verify_zkemail_and_recover` for zk-email recovery,
 * - Performing legacy plaintext on-chain verification via `verify_email_onchain_and_recover`
 *   for backwards compatibility only.
 */
export class EmailRecoveryService {
  private readonly deps: EmailRecoveryServiceDeps;
  private cachedOutlayerPk: Uint8Array | null = null;

  constructor(deps: EmailRecoveryServiceDeps) {
    this.deps = deps;
  }

  private async getOutlayerEmailDkimPublicKey(): Promise<Uint8Array> {
    if (this.cachedOutlayerPk) {
      return this.cachedOutlayerPk;
    }
    const pk = await getOutlayerEncryptionPublicKey(this.deps);
    this.cachedOutlayerPk = pk;
    return pk;
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
	      const errMsg = 'accountId is required';
	      return { success: false, error: errMsg, message: errMsg };
	    }
	    if (!emailBlob || typeof emailBlob !== 'string') {
	      const errMsg = 'emailBlob (raw email) is required';
	      return { success: false, error: errMsg, message: errMsg };
	    }

	    const { ensureSignerAndRelayerAccount } = this.deps;

	    try {
	      await ensureSignerAndRelayerAccount();
	    } catch (e: any) {
	      const msg = e?.message || 'Failed to initialize relayer account';
	      return { success: false, error: msg, message: msg };
	    }

		    const recipientPk = await this.getOutlayerEmailDkimPublicKey();
	    console.log('[email-recovery] encrypted using Outlayer public key', {
	      accountId,
	      outlayer_pk_bytes: Array.from(recipientPk),
	    });

	    const { actions, receiverId } = await buildEncryptedEmailRecoveryActions(this.deps, {
	      accountId,
	      emailBlob,
	      recipientPk,
	      encrypt: async ({ emailRaw, aeadContext, recipientPk: pk }) => {
	        const { envelope } = await encryptEmailForOutlayer({
	          emailRaw,
	          aeadContext,
	          recipientPk: pk,
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

	        return { envelope };
	      },
	    });

	    return sendEmailRecoveryTransaction(this.deps, {
	      receiverId,
	      actions,
	      label: `Encrypted email verification requested for ${accountId}`,
	    });
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

	    const { ensureSignerAndRelayerAccount } = this.deps;

    try {
      await ensureSignerAndRelayerAccount();
    } catch (e: any) {
      const msg = e?.message || 'Failed to initialize relayer account';
      return { success: false, error: msg, message: msg };
    }

	    const { actions, receiverId } = await buildOnchainEmailRecoveryActions(this.deps, {
	      accountId,
	      emailBlob,
	    });

	    return sendEmailRecoveryTransaction(this.deps, {
	      receiverId,
	      actions,
	      label: `On-chain email verification requested for ${accountId}`,
	    });
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

	    const { ensureSignerAndRelayerAccount, zkEmailProver } = this.deps;

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

	      const { actions, receiverId } = await buildZkEmailRecoveryActions(this.deps, {
	        accountId,
	        contractArgs,
	      });

	      return sendEmailRecoveryTransaction(this.deps, {
	        receiverId,
	        actions,
	        label: `ZK-email recovery requested for ${accountId}`,
	      });
	    } catch (error: any) {
	      const code = (error && typeof error.code === 'string') ? (error.code as string) : undefined;
	      let errorCode = 'zkemail_unknown_error';
	      let msg = error?.message || 'Unknown zk-email recovery error';

	      if (code === 'prover_timeout') {
	        errorCode = 'zkemail_prover_timeout';
	        msg = 'ZK-email prover request timed out';
	      } else if (code === 'prover_http_error') {
	        errorCode = 'zkemail_prover_http_error';
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
	  }

}
