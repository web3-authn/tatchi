import type { ActionArgsWasm } from '../../core/types/actions';
import { ActionType, validateActionArgsWasm } from '../../core/types/actions';
import { parseContractExecutionError } from '../core/errors';
import { generateZkEmailProofFromPayload, type ZkEmailProverClientOptions } from './zkEmail';
import { extractRecoveryModeFromBody, parseRecoveryMode } from './emailParsers';
import { encryptEmailForOutlayer, hashRecoveryEmailForAccount } from './emailEncryptor';
import { buildEncryptedEmailRecoveryActions, buildOnchainEmailRecoveryActions, buildZkEmailRecoveryActions, sendEmailRecoveryTransaction, getOutlayerEncryptionPublicKey } from './rpcCalls';
import { ZkEmailProverClient } from './zkEmail/proverClient';
import { mapZkEmailRecoveryError, prepareZkEmailRecovery } from './zkEmail/recovery';
import { coerceLogger, type NormalizedLogger } from '../core/logger';
import type {
  EmailRecoveryDispatchRequest,
  EmailRecoveryMode,
  EmailRecoveryRequest,
  EmailRecoveryResult,
  EmailRecoveryServiceDeps,
} from './types';

export * from './emailEncryptor';
export * from './zkEmail';
export * from './zkEmail/recovery';
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
 *   - `verify_encrypted_email_and_recover(encrypted_email_blob, aead_context, expected_hashed_email, expected_new_public_key, request_id)` for DKIM/TEE,
 *   - `verify_zkemail_and_recover(..., request_id)` for zk-email recovery,
 * - Performing legacy plaintext on-chain verification via `verify_email_onchain_and_recover`
 *   for backwards compatibility only.
 */
export class EmailRecoveryService {
  private readonly deps: EmailRecoveryServiceDeps;
  private readonly logger: NormalizedLogger;
  private cachedOutlayerPk: Uint8Array | null = null;
  private zkEmailProverClient: ZkEmailProverClient | null = null;
  private zkEmailProverClientKey: string | null = null;

  constructor(deps: EmailRecoveryServiceDeps) {
    this.deps = deps;
    this.logger = coerceLogger(deps.logger);
  }

  /**
   * Lightweight view of zk-email prover wiring for health/readiness endpoints.
   * This does not perform any network calls.
   */
  getZkEmailProverBaseUrl(): string | null {
    const baseUrl = String(this.deps.zkEmailProver?.baseUrl || '').trim().replace(/\/+$/, '');
    return baseUrl ? baseUrl : null;
  }

  /**
   * Readiness check for zk-email prover.
   *
   * Returns `healthy: null` when zk-email prover is not configured.
   * Does not log; callers (routers) may decide how/when to log.
   */
  async checkZkEmailProverHealth(): Promise<{
    configured: boolean;
    baseUrl: string | null;
    healthy: boolean | null;
    errorCode?: string;
    message?: string;
    proverCauseCode?: string;
    proverCauseMessage?: string;
  }> {
    const baseUrl = this.getZkEmailProverBaseUrl();
    const opts = this.deps.zkEmailProver;
    if (!baseUrl || !opts) {
      return { configured: false, baseUrl: null, healthy: null };
    }

    try {
      const client = this.getZkEmailProverClient({ ...opts, baseUrl });
      await client.healthz();
      return { configured: true, baseUrl, healthy: true };
    } catch (e: unknown) {
      const mapped = mapZkEmailRecoveryError(e);
      return {
        configured: true,
        baseUrl,
        healthy: false,
        errorCode: mapped.errorCode,
        message: mapped.message,
        proverCauseCode: mapped.proverCauseCode,
        proverCauseMessage: mapped.proverCauseMessage,
      };
    }
  }

  private getZkEmailProverClient(opts: ZkEmailProverClientOptions): ZkEmailProverClient {
    const baseUrl = String(opts.baseUrl || '').replace(/\/+$/, '');
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const healthCheck = opts.healthCheck;
    const key = `${baseUrl}|${timeoutMs}|${healthCheck?.enabled ?? 'default'}|${healthCheck?.ttlMs ?? 'default'}|${healthCheck?.timeoutMs ?? 'default'}`;

    if (this.zkEmailProverClient && this.zkEmailProverClientKey === key) {
      return this.zkEmailProverClient;
    }

    const client = new ZkEmailProverClient(opts);
    this.zkEmailProverClient = client;
    this.zkEmailProverClientKey = key;
    return client;
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
      parseRecoveryMode(input.explicitMode) ??
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
    this.logger.debug('[email-recovery] requestEmailRecovery mode selected', {
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
   * The per-account EmailRecoverer records a pollable attempt keyed by
   * `request_id` (parsed from the email Subject) so the frontend can observe
   * success/failure by polling `EmailRecoverer.get_recovery_attempt(request_id)`.
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
		    this.logger.debug('[email-recovery] encrypted using Outlayer public key', {
		      accountId,
		      outlayerPkLen: recipientPk.length,
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

		        this.logger.debug('[email-recovery] encrypted email envelope metadata', {
		          accountId,
		          aeadContextLen: aeadContext.length,
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
   * - Extracts subject/header bindings (account_id, new_public_key, from_email, timestamp) and derives `from_address_hash`.
   * - Calls the per-account EmailRecoverer contract with verify_zkemail_and_recover.
   */
	  async verifyZkemailAndRecover(request: EmailRecoveryRequest): Promise<EmailRecoveryResult> {
	    const accountId = (request.accountId || '').trim();
	    const emailBlob = request.emailBlob;

    if (!accountId) {
      return {
        success: false,
        error: 'zkemail_missing_account_id',
        message: 'accountId is required',
      };
    }
    if (!emailBlob || typeof emailBlob !== 'string') {
      return {
        success: false,
        error: 'zkemail_missing_email_blob',
        message: 'emailBlob (raw email) is required',
      };
    }

	    const { ensureSignerAndRelayerAccount, zkEmailProver } = this.deps;

    if (!zkEmailProver || !zkEmailProver.baseUrl) {
      this.logger.warn('[email-recovery] zk-email missing prover configuration', { accountId });
      return {
        success: false,
        error: 'zkemail_prover_not_configured',
        message: 'zk-email prover configuration is missing',
      };
    }

    const prepared = prepareZkEmailRecovery(emailBlob, accountId);
    if (!prepared.ok) {
      const log = {
        accountId,
        requestId: prepared.requestId,
        proverBaseUrl: zkEmailProver.baseUrl,
        errorCode: prepared.errorCode,
        errorMessage: prepared.message,
        accountIdSubject: prepared.subjectAccountId,
      };
      if (prepared.errorCode === 'zkemail_account_mismatch') {
        this.logger.warn('[email-recovery] zk-email account mismatch', log);
      } else {
        this.logger.warn('[email-recovery] zk-email recovery rejected', log);
      }
      return { success: false, error: prepared.errorCode, message: prepared.message };
    }

    const { payload, bindings } = prepared.prepared;

    try {
      await ensureSignerAndRelayerAccount();
    } catch (e: any) {
      const msg = e?.message || 'Failed to initialize relayer account';
      this.logger.error('[email-recovery] zk-email ensureSignerAndRelayerAccount failed', {
        accountId,
        requestId: bindings.requestId,
        error: msg,
      });
      return { success: false, error: 'zkemail_relayer_init_failed', message: msg };
    }

	    try {
	      const proverClient = this.getZkEmailProverClient(zkEmailProver);
	      const proofResult = await generateZkEmailProofFromPayload(payload, proverClient);

        const fromAddressHash = hashRecoveryEmailForAccount({
          recoveryEmail: bindings.fromEmail,
          accountId: bindings.accountId,
        });

        if (fromAddressHash.length !== 32) {
          throw new Error(`from_address_hash must be 32 bytes, got ${fromAddressHash.length}`);
        }

		      const contractArgs = {
		        proof: proofResult.proof,
		        public_inputs: proofResult.publicInputs,
		        account_id: bindings.accountId,
		        new_public_key: bindings.newPublicKey,
		        request_id: bindings.requestId,
		        from_address_hash: fromAddressHash,
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
        const mapped = mapZkEmailRecoveryError(error);

		      this.logger.error('[email-recovery] zk-email recovery error', {
		        accountId,
	          requestId: bindings.requestId,
		        errorCode: mapped.errorCode,
		        errorMessage: mapped.message,
	          proverBaseUrl: zkEmailProver.baseUrl,
	          proverCauseCode: mapped.proverCauseCode,
	          proverCauseMessage: mapped.proverCauseMessage,
		      });

	      return {
	        success: false,
	        error: mapped.errorCode,
	        message: mapped.message,
	      };
	    }
	  }

}
