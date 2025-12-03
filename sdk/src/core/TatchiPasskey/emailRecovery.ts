import type { PasskeyManagerContext } from './index';
import { IndexedDBManager } from '../IndexedDBManager';
import { validateNearAccountId } from '../../utils/validation';
import { toAccountId, type AccountId } from '../types/accountIds';
import {
  EmailRecoveryPhase,
  EmailRecoveryStatus,
  type EmailRecoverySSEEvent,
  type EventCallback,
  type AfterCall,
  type TatchiPasskeyConfigs,
} from '../types/passkeyManager';
import { authenticatorsToAllowCredentials } from '../WebAuthnManager/touchIdPrompt';
import type {
  EncryptedVRFKeypair,
  ServerEncryptedVrfKeypair,
  VRFChallenge,
} from '../types/vrf-worker';
import type { WebAuthnRegistrationCredential } from '../types';

export type PendingEmailRecoveryStatus =
  | 'awaiting-email'
  | 'awaiting-add-key'
  | 'finalizing'
  | 'complete'
  | 'error';

export type PendingEmailRecovery = {
  accountId: AccountId;
  recoveryEmail: string;
  deviceNumber: number;
  nearPublicKey: string;
  encryptedVrfKeypair: EncryptedVRFKeypair;
  serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
  vrfPublicKey: string;
  credential: WebAuthnRegistrationCredential;
  vrfChallenge?: VRFChallenge;
  createdAt: number;
  status: PendingEmailRecoveryStatus;
};

export interface EmailRecoveryFlowOptions {
  onEvent?: EventCallback<EmailRecoverySSEEvent>;
  onError?: (error: Error) => void;
  afterCall?: AfterCall<void>;
}

let warnedMissingMailtoAddress = false;

function getEmailRecoveryConfig(configs: TatchiPasskeyConfigs | undefined): {
  minBalanceYocto: string;
  pollingIntervalMs: number;
  maxPollingDurationMs: number;
  pendingTtlMs: number;
  mailtoAddress: string;
} {
  const MIN_BALANCE_YOCTO_DEFAULT = '10000000000000000000000'; // 0.01 NEAR (1e22 yocto)
  const relayerEmailCfg = configs?.relayer?.emailRecovery || {};
  if (!relayerEmailCfg && !warnedMissingMailtoAddress) {
    warnedMissingMailtoAddress = true;
    console.warn('[EmailRecovery] relayer.emailRecovery is not configured; using defaults.');
  }
  // Default to 0.01 NEAR unless overridden
  const minBalanceYocto = String(relayerEmailCfg.minBalanceYocto ?? MIN_BALANCE_YOCTO_DEFAULT);
  const pollingIntervalMs = Number(relayerEmailCfg.pollingIntervalMs ?? 4000);
  const maxPollingDurationMs = Number(relayerEmailCfg.maxPollingDurationMs ?? 30 * 60 * 1000);
  const pendingTtlMs = Number(relayerEmailCfg.pendingTtlMs ?? 30 * 60 * 1000);
  const mailtoAddressRaw = relayerEmailCfg.mailtoAddress;
  const mailtoAddress = String(mailtoAddressRaw || 'recover@web3authn.org');
  if (!mailtoAddressRaw && !warnedMissingMailtoAddress) {
    warnedMissingMailtoAddress = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[EmailRecovery] relayer.emailRecovery.mailtoAddress not configured; defaulting to recover@web3authn.org'
    );
  }
  return { minBalanceYocto, pollingIntervalMs, maxPollingDurationMs, pendingTtlMs, mailtoAddress };
}

export class EmailRecoveryFlow {
  private context: PasskeyManagerContext;
  private options?: EmailRecoveryFlowOptions;
  private pending: PendingEmailRecovery | null = null;
  private phase: EmailRecoveryPhase = EmailRecoveryPhase.STEP_1_PREPARATION;
  private pollingTimer: any;
  private pollIntervalResolver?: (value?: void | PromiseLike<void>) => void;
  private pollingStartedAt: number | null = null;
  private cancelled = false;
  private error?: Error;

  constructor(context: PasskeyManagerContext, options?: EmailRecoveryFlowOptions) {
    this.context = context;
    this.options = options;
  }

  setOptions(options?: EmailRecoveryFlowOptions) {
    if (!options) return;
    this.options = { ...(this.options || {}), ...options };
  }
  private emit(event: EmailRecoverySSEEvent) {
    this.options?.onEvent?.(event);
  }

  private emitError(step: number, message: string): Error {
    const err = new Error(message);
    this.phase = EmailRecoveryPhase.ERROR;
    this.error = err;
    this.emit({
      step,
      phase: EmailRecoveryPhase.ERROR,
      status: EmailRecoveryStatus.ERROR,
      message,
      error: message,
    } as EmailRecoverySSEEvent & { error: string });
    this.options?.onError?.(err);
    return err;
  }

  private getConfig() {
    return getEmailRecoveryConfig(this.context.configs);
  }

  private async loadPending(
    accountId: AccountId,
    nearPublicKey?: string
  ): Promise<PendingEmailRecovery | null> {
    const { pendingTtlMs } = this.getConfig();
    const keyPrefix = `pendingEmailRecovery:${accountId}`;
    const key = nearPublicKey ? `${keyPrefix}:${nearPublicKey}` : keyPrefix;
    const record = await IndexedDBManager.clientDB.getAppState<PendingEmailRecovery | null>(key);
    if (!record) return null;
    if (Date.now() - record.createdAt > pendingTtlMs) {
      await IndexedDBManager.clientDB.setAppState(key, undefined as any);
      return null;
    }
    return record;
  }

  private async savePending(rec: PendingEmailRecovery): Promise<void> {
    const key = `pendingEmailRecovery:${rec.accountId}:${rec.nearPublicKey}`;
    await IndexedDBManager.clientDB.setAppState(key, rec);
    this.pending = rec;
  }

  private async clearPending(accountId: AccountId, nearPublicKey?: string): Promise<void> {
    const keyPrefix = `pendingEmailRecovery:${accountId}`;
    const key = nearPublicKey ? `${keyPrefix}:${nearPublicKey}` : keyPrefix;
    await IndexedDBManager.clientDB.setAppState(key, undefined as any);
    if (this.pending && this.pending.accountId === accountId && (!nearPublicKey || this.pending.nearPublicKey === nearPublicKey)) {
      this.pending = null;
    }
  }

  getState() {
    return {
      phase: this.phase,
      pending: this.pending,
      error: this.error,
    };
  }

  async buildMailtoUrl(args: { accountId: string; nearPublicKey?: string }): Promise<string> {
    const { accountId, nearPublicKey } = args;
    this.cancelled = false;
    this.error = undefined;

    const validation = validateNearAccountId(accountId as AccountId);
    if (!validation.valid) {
      const err = this.emitError(3, `Invalid NEAR account ID: ${validation.error}`);
      await this.options?.afterCall?.(false);
      throw err;
    }

    const nearAccountId = toAccountId(accountId as string);
    let rec = this.pending;
    if (!rec || rec.accountId !== nearAccountId || (nearPublicKey && rec.nearPublicKey !== nearPublicKey)) {
      rec = await this.loadPending(nearAccountId, nearPublicKey);
      this.pending = rec;
    }

    if (!rec) {
      const err = this.emitError(3, 'No pending email recovery record found for this account');
      await this.options?.afterCall?.(false);
      throw err;
    }

    if (rec.status === 'error') {
      const err = this.emitError(3, 'Pending email recovery is in an error state; please restart the flow');
      await this.options?.afterCall?.(false);
      throw err;
    }

    if (rec.status === 'finalizing' || rec.status === 'complete') {
      const err = this.emitError(3, 'Recovery email has already been processed on-chain for this request');
      await this.options?.afterCall?.(false);
      throw err;
    }

    const mailtoUrl =
      rec.status === 'awaiting-email'
        ? await this.buildMailtoUrlAndUpdateStatus(rec)
        : this.buildMailtoUrlInternal(rec);
    this.phase = EmailRecoveryPhase.STEP_3_AWAIT_EMAIL;
    this.emit({
      step: 3,
      phase: EmailRecoveryPhase.STEP_3_AWAIT_EMAIL,
      status: EmailRecoveryStatus.PROGRESS,
      message: 'New device key created; please send the recovery email from your registered address.',
      data: {
        accountId: rec.accountId,
        recoveryEmail: rec.recoveryEmail,
        nearPublicKey: rec.nearPublicKey,
        mailtoUrl,
      },
    } as EmailRecoverySSEEvent & { data: Record<string, unknown> });
    await this.options?.afterCall?.(true, undefined as any);
    return mailtoUrl;
  }

  async start(args: { accountId: string; recoveryEmail: string }): Promise<{ mailtoUrl: string; nearPublicKey: string }> {
    const { accountId, recoveryEmail } = args;
    this.cancelled = false;
    this.error = undefined;
    this.phase = EmailRecoveryPhase.STEP_1_PREPARATION;

    this.emit({
      step: 1,
      phase: EmailRecoveryPhase.STEP_1_PREPARATION,
      status: EmailRecoveryStatus.PROGRESS,
      message: 'Preparing email recovery...',
    });

    const validation = validateNearAccountId(accountId as AccountId);
    if (!validation.valid) {
      const err = this.emitError(1, `Invalid NEAR account ID: ${validation.error}`);
      await this.options?.afterCall?.(false);
      throw err;
    }

    const nearAccountId = toAccountId(accountId as string);
    const { minBalanceYocto } = this.getConfig();
    const STORAGE_PRICE_PER_BYTE = BigInt('10000000000000000000'); // 1e19 yocto NEAR per byte

    try {
      const accountView = await this.context.nearClient.viewAccount(nearAccountId);
      const amount = BigInt(accountView.amount || '0');
      const locked = BigInt((accountView as any).locked || '0');
      const storageUsage = BigInt((accountView as any).storage_usage || 0);
      const storageCost = storageUsage * STORAGE_PRICE_PER_BYTE;
      const rawAvailable = amount - locked - storageCost;
      const available = rawAvailable > 0 ? rawAvailable : BigInt(0);
      if (available < BigInt(minBalanceYocto)) {
        const err = this.emitError(
          1,
          `This account does not have enough NEAR to finalize recovery. Available: ${available.toString()} yocto; required: ${String(minBalanceYocto)}. Please top up and try again.`
        );
        await this.options?.afterCall?.(false);
        throw err;
      }
    } catch (e: any) {
      const err = this.emitError(1, e?.message || 'Failed to fetch account balance for recovery');
      await this.options?.afterCall?.(false);
      throw err;
    }

    const canonicalEmail = String(recoveryEmail || '').trim().toLowerCase();
    if (!canonicalEmail) {
      const err = this.emitError(1, 'Recovery email is required for email-based account recovery');
      await this.options?.afterCall?.(false);
      throw err;
    }

    // Determine deviceNumber from on-chain authenticators
    let deviceNumber = 1;
    try {
      const { syncAuthenticatorsContractCall } = await import('../rpcCalls');
      const authenticators = await syncAuthenticatorsContractCall(
        this.context.nearClient,
        this.context.configs.contractId,
        nearAccountId
      );
      const numbers = authenticators
        .map((a: any) => a?.authenticator?.deviceNumber)
        .filter((n: any) => typeof n === 'number' && Number.isFinite(n)) as number[];
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      deviceNumber = max + 1;
    } catch {
      deviceNumber = 1;
    }

    this.phase = EmailRecoveryPhase.STEP_2_TOUCH_ID_REGISTRATION;
    this.emit({
      step: 2,
      phase: EmailRecoveryPhase.STEP_2_TOUCH_ID_REGISTRATION,
      status: EmailRecoveryStatus.PROGRESS,
      message: 'Collecting passkey for email recovery...',
    });

    try {
      const confirm = await this.context.webAuthnManager.requestRegistrationCredentialConfirmation({
        nearAccountId,
        deviceNumber,
        contractId: this.context.configs.contractId,
        nearRpcUrl: this.context.configs.nearRpcUrl,
      });
      if (!confirm.confirmed || !confirm.credential) {
        const err = this.emitError(2, 'User cancelled email recovery TouchID confirmation');
        await this.options?.afterCall?.(false);
        throw err;
      }

      const vrfDerivationResult = await this.context.webAuthnManager.deriveVrfKeypairFromRawPrf({
        prfOutput: confirm.prfOutput!,
        nearAccountId,
      });

      if (!vrfDerivationResult.success || !vrfDerivationResult.encryptedVrfKeypair) {
        const err = this.emitError(2, 'Failed to derive VRF keypair from PRF for email recovery');
        await this.options?.afterCall?.(false);
        throw err;
      }

      const nearKeyResult = await this.context.webAuthnManager.deriveNearKeypairAndEncryptFromSerialized({
        nearAccountId,
        credential: confirm.credential,
        options: { deviceNumber },
      });

      if (!nearKeyResult.success || !nearKeyResult.publicKey) {
        const err = this.emitError(2, 'Failed to derive NEAR keypair for email recovery');
        await this.options?.afterCall?.(false);
        throw err;
      }

      const rec: PendingEmailRecovery = {
        accountId: nearAccountId,
        recoveryEmail: canonicalEmail,
        deviceNumber,
        nearPublicKey: nearKeyResult.publicKey,
        encryptedVrfKeypair: vrfDerivationResult.encryptedVrfKeypair,
        serverEncryptedVrfKeypair: vrfDerivationResult.serverEncryptedVrfKeypair || null,
        vrfPublicKey: vrfDerivationResult.vrfPublicKey,
        credential: confirm.credential,
        vrfChallenge: confirm.vrfChallenge || undefined,
        createdAt: Date.now(),
        status: 'awaiting-email',
      };

      const mailtoUrl = await this.buildMailtoUrlAndUpdateStatus(rec);

      this.phase = EmailRecoveryPhase.STEP_3_AWAIT_EMAIL;
      this.emit({
        step: 3,
        phase: EmailRecoveryPhase.STEP_3_AWAIT_EMAIL,
        status: EmailRecoveryStatus.PROGRESS,
        message: 'New device key created; please send the recovery email from your registered address.',
        data: {
          accountId: rec.accountId,
          recoveryEmail: rec.recoveryEmail,
          nearPublicKey: rec.nearPublicKey,
          mailtoUrl,
        },
      } as EmailRecoverySSEEvent & { data: Record<string, unknown> });

      await this.options?.afterCall?.(true, undefined as any);

      return { mailtoUrl, nearPublicKey: rec.nearPublicKey };
    } catch (e: any) {
      const err = this.emitError(2, e?.message || 'Email recovery TouchID/derivation failed');
      await this.options?.afterCall?.(false);
      throw err;
    }
  }

  private buildMailtoUrlInternal(rec: PendingEmailRecovery): string {
    const { mailtoAddress } = this.getConfig();
    const to = encodeURIComponent(mailtoAddress);
    const subject = encodeURIComponent(`recover ${rec.accountId} ${rec.nearPublicKey}`);
    const body = encodeURIComponent(`Recovering account ${rec.accountId} with a new passkey.`);
    return `mailto:${to}?subject=${subject}&body=${body}`;
  }

  private async buildMailtoUrlAndUpdateStatus(rec: PendingEmailRecovery): Promise<string> {
    rec.status = 'awaiting-add-key';
    await this.savePending(rec);
    return this.buildMailtoUrlInternal(rec);
  }

  async startPolling(args: { accountId: string; nearPublicKey?: string }): Promise<void> {
    const { accountId, nearPublicKey } = args;
    this.cancelled = false;
    this.error = undefined;

    const validation = validateNearAccountId(accountId as AccountId);
    if (!validation.valid) {
      const err = this.emitError(4, `Invalid NEAR account ID: ${validation.error}`);
      await this.options?.afterCall?.(false);
      throw err;
    }
    const nearAccountId = toAccountId(accountId as string);

    let rec = this.pending;
    if (!rec || rec.accountId !== nearAccountId || (nearPublicKey && rec.nearPublicKey !== nearPublicKey)) {
      rec = await this.loadPending(nearAccountId, nearPublicKey);
      this.pending = rec;
    }
    if (!rec) {
      const err = this.emitError(4, 'No pending email recovery record found for this account');
      await this.options?.afterCall?.(false);
      throw err;
    }
    if (rec.status === 'error') {
      const err = this.emitError(4, 'Pending email recovery is in an error state; please restart the flow');
      await this.options?.afterCall?.(false);
      throw err;
    }
    if (rec.status === 'complete' || rec.status === 'finalizing') {
      await this.options?.afterCall?.(true, undefined as any);
      return;
    }
    if (rec.status === 'awaiting-email') {
      await this.buildMailtoUrlAndUpdateStatus(rec);
    }

    await this.pollUntilAddKey(rec);
    await this.options?.afterCall?.(true, undefined as any);
  }

  stopPolling(): void {
    this.cancelled = true;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }
    if (this.pollIntervalResolver) {
      this.pollIntervalResolver();
      this.pollIntervalResolver = undefined;
    }
  }

  async finalize(args: { accountId: string; nearPublicKey?: string }): Promise<void> {
    const { accountId, nearPublicKey } = args;
    this.cancelled = false;
    this.error = undefined;

    const validation = validateNearAccountId(accountId as AccountId);
    if (!validation.valid) {
      const err = this.emitError(4, `Invalid NEAR account ID: ${validation.error}`);
      await this.options?.afterCall?.(false);
      throw err;
    }
    const nearAccountId = toAccountId(accountId as string);

    let rec = this.pending;
    if (!rec || rec.accountId !== nearAccountId || (nearPublicKey && rec.nearPublicKey !== nearPublicKey)) {
      rec = await this.loadPending(nearAccountId, nearPublicKey);
      this.pending = rec;
    }
    if (!rec) {
      const err = this.emitError(4, 'No pending email recovery record found for this account');
      await this.options?.afterCall?.(false);
      throw err;
    }

    this.emit({
      step: 0,
      phase: EmailRecoveryPhase.RESUMED_FROM_PENDING,
      status: EmailRecoveryStatus.PROGRESS,
      message: 'Resuming email recovery from pending state...',
      data: {
        accountId: rec.accountId,
        nearPublicKey: rec.nearPublicKey,
        status: rec.status,
      },
    } as EmailRecoverySSEEvent & { data: Record<string, unknown> });

    if (rec.status === 'complete') {
      this.phase = EmailRecoveryPhase.STEP_6_COMPLETE;
      this.emit({
        step: 6,
        phase: EmailRecoveryPhase.STEP_6_COMPLETE,
        status: EmailRecoveryStatus.SUCCESS,
        message: 'Email recovery already completed for this key.',
      });
      await this.options?.afterCall?.(true, undefined as any);
      return;
    }

    const hasKeyAlready = await this.checkAccessKey(rec);
    if (!hasKeyAlready) {
      await this.pollUntilAddKey(rec);
    }

    await this.finalizeRegistration(rec);
    await this.options?.afterCall?.(true, undefined as any);
  }

  private async checkAccessKey(rec: PendingEmailRecovery): Promise<boolean> {
    try {
      await this.context.nearClient.viewAccessKey(rec.accountId, rec.nearPublicKey);
      return true;
    } catch {
      return false;
    }
  }

  private async pollUntilAddKey(rec: PendingEmailRecovery): Promise<void> {
    const { pollingIntervalMs, maxPollingDurationMs } = this.getConfig();
    this.phase = EmailRecoveryPhase.STEP_4_POLLING_ADD_KEY;
    this.pollingStartedAt = Date.now();

    while (!this.cancelled) {
      const elapsed = Date.now() - (this.pollingStartedAt || 0);
      if (elapsed > maxPollingDurationMs) {
        const err = this.emitError(4, 'Timed out waiting for recovery email to be processed on-chain');
        rec.status = 'error';
        await this.savePending(rec);
        await this.options?.afterCall?.(false);
        throw err;
      }

      const hasKey = await this.checkAccessKey(rec);
      this.emit({
        step: 4,
        phase: EmailRecoveryPhase.STEP_4_POLLING_ADD_KEY,
        status: EmailRecoveryStatus.PROGRESS,
        message: hasKey
          ? 'Recovery key detected on-chain; finalizing registration...'
          : 'Waiting for recovery email to be processed on-chain...',
        data: {
          accountId: rec.accountId,
          nearPublicKey: rec.nearPublicKey,
          elapsedMs: elapsed,
        },
      } as EmailRecoverySSEEvent & { data: Record<string, unknown> });

      if (hasKey) {
        rec.status = 'finalizing';
        await this.savePending(rec);
        return;
      }

      await new Promise<void>(resolve => {
        this.pollIntervalResolver = resolve;
        this.pollingTimer = setTimeout(() => {
          this.pollIntervalResolver = undefined;
          this.pollingTimer = undefined;
          resolve();
        }, pollingIntervalMs);
      }).finally(() => {
        this.pollIntervalResolver = undefined;
      });
    }

    const err = this.emitError(4, 'Email recovery polling was cancelled');
    await this.options?.afterCall?.(false);
    throw err;
  }

  private async finalizeRegistration(rec: PendingEmailRecovery): Promise<void> {
    this.phase = EmailRecoveryPhase.STEP_5_FINALIZING_REGISTRATION;
    this.emit({
      step: 5,
      phase: EmailRecoveryPhase.STEP_5_FINALIZING_REGISTRATION,
      status: EmailRecoveryStatus.PROGRESS,
      message: 'Finalizing email recovery registration...',
      data: {
        accountId: rec.accountId,
        nearPublicKey: rec.nearPublicKey,
      },
    } as EmailRecoverySSEEvent & { data: Record<string, unknown> });

    const nonceManager = this.context.webAuthnManager.getNonceManager();
    const accountId = toAccountId(rec.accountId);
    nonceManager.initializeUser(accountId, rec.nearPublicKey);

    let nextNonce: string;
    let txBlockHash: string;
    try {
      const result = await nonceManager.getNonceBlockHashAndHeight(this.context.nearClient);
      nextNonce = result.nextNonce;
      txBlockHash = result.txBlockHash;
    } catch (e: any) {
      const err = this.emitError(5, e?.message || 'Failed to fetch nonce and block hash for registration');
      await this.options?.afterCall?.(false);
      throw err;
    }

    try {
      const nearKeyResult = await this.context.webAuthnManager.deriveNearKeypairAndEncryptFromSerialized({
        nearAccountId: accountId,
        credential: rec.credential,
        options: {
          vrfChallenge: rec.vrfChallenge,
          contractId: this.context.configs.contractId,
          nonce: nextNonce,
          blockHash: txBlockHash,
          deterministicVrfPublicKey: rec.vrfPublicKey,
          deviceNumber: rec.deviceNumber,
        },
      });

      if (!nearKeyResult.success || !nearKeyResult.signedTransaction) {
        const err = this.emitError(5, nearKeyResult.error || 'Failed to sign email recovery registration transaction');
        await this.options?.afterCall?.(false);
        throw err;
      }

      try {
        await this.context.nearClient.sendTransaction(nearKeyResult.signedTransaction);
      } catch (e: any) {
        const msg = String(e?.message || '');
        const err = this.emitError(
          5,
          msg || 'Failed to broadcast email recovery registration transaction (insufficient funds or RPC error)'
        );
        await this.options?.afterCall?.(false);
        throw err;
      }

      try {
        await nonceManager.updateNonceFromBlockchain(this.context.nearClient, nextNonce);
      } catch {
        // best-effort; do not fail flow
      }

      const { webAuthnManager } = this.context;

      await webAuthnManager.storeUserData({
        nearAccountId: accountId,
        deviceNumber: rec.deviceNumber,
        clientNearPublicKey: rec.nearPublicKey,
        lastUpdated: Date.now(),
        passkeyCredential: {
          id: rec.credential.id,
          rawId: rec.credential.rawId,
        },
        encryptedVrfKeypair: {
          encryptedVrfDataB64u: rec.encryptedVrfKeypair.encryptedVrfDataB64u,
          chacha20NonceB64u: rec.encryptedVrfKeypair.chacha20NonceB64u,
        },
        serverEncryptedVrfKeypair: rec.serverEncryptedVrfKeypair || undefined,
      } as any);

      try {
        const attestationB64u = rec.credential.response.attestationObject;
        const credentialPublicKey = await webAuthnManager.extractCosePublicKey(attestationB64u);
        await webAuthnManager.storeAuthenticator({
          nearAccountId: accountId,
          deviceNumber: rec.deviceNumber,
          credentialId: rec.credential.rawId,
          credentialPublicKey,
          transports: ['internal'],
          name: `Device ${rec.deviceNumber} Passkey for ${rec.accountId.split('.')[0]}`,
          registered: new Date().toISOString(),
          syncedAt: new Date().toISOString(),
          vrfPublicKey: rec.vrfPublicKey,
        });
      } catch {
        // best-effort; do not fail flow
      }

      await this.attemptAutoLogin(rec);

      rec.status = 'complete';
      await this.savePending(rec);
      await this.clearPending(rec.accountId, rec.nearPublicKey);

      this.phase = EmailRecoveryPhase.STEP_6_COMPLETE;
      this.emit({
        step: 6,
        phase: EmailRecoveryPhase.STEP_6_COMPLETE,
        status: EmailRecoveryStatus.SUCCESS,
        message: 'Email recovery completed successfully',
        data: {
          accountId: rec.accountId,
          nearPublicKey: rec.nearPublicKey,
        },
      } as EmailRecoverySSEEvent & { data: Record<string, unknown> });
    } catch (e: any) {
      const err = this.emitError(5, e?.message || 'Email recovery finalization failed');
      await this.options?.afterCall?.(false);
      throw err;
    }
  }

  private async attemptAutoLogin(rec: PendingEmailRecovery): Promise<void> {
    try {
    this.emit({
      step: 5,
      phase: EmailRecoveryPhase.STEP_5_FINALIZING_REGISTRATION,
      status: EmailRecoveryStatus.PROGRESS,
      message: 'Attempting auto-login with recovered device...',
      data: { autoLogin: 'progress' },
    } as EmailRecoverySSEEvent & { data: Record<string, unknown> });

      const { webAuthnManager } = this.context;
      const accountId = toAccountId(rec.accountId);

      // Try Shamir 3-pass unlock first if configured and available
      if (
        rec.serverEncryptedVrfKeypair &&
        rec.serverEncryptedVrfKeypair.serverKeyId &&
        this.context.configs.vrfWorkerConfigs?.shamir3pass?.relayServerUrl
      ) {
        try {
          const unlockResult = await webAuthnManager.shamir3PassDecryptVrfKeypair({
            nearAccountId: accountId,
            kek_s_b64u: rec.serverEncryptedVrfKeypair.kek_s_b64u,
            ciphertextVrfB64u: rec.serverEncryptedVrfKeypair.ciphertextVrfB64u,
            serverKeyId: rec.serverEncryptedVrfKeypair.serverKeyId,
          });

          if (unlockResult.success) {
            await webAuthnManager.initializeCurrentUser(accountId, this.context.nearClient);
            await webAuthnManager.setLastUser(accountId, rec.deviceNumber);
            this.emit({
              step: 5,
              phase: EmailRecoveryPhase.STEP_5_FINALIZING_REGISTRATION,
              status: EmailRecoveryStatus.SUCCESS,
              message: `Welcome ${accountId}`,
              data: { autoLogin: 'success' },
            } as EmailRecoverySSEEvent & { data: Record<string, unknown> });
            return;
          }
        } catch (err) {
          // fall through to TouchID unlock
          console.warn('[EmailRecoveryFlow] Shamir 3-pass unlock failed, falling back to TouchID', err);
        }
      }

      // TouchID fallback unlock
      const { txBlockHash, txBlockHeight } = await webAuthnManager
        .getNonceManager()
        .getNonceBlockHashAndHeight(this.context.nearClient);

      const authChallenge = await webAuthnManager.generateVrfChallenge({
        userId: accountId,
        rpId: webAuthnManager.getRpId(),
        blockHash: txBlockHash,
        blockHeight: txBlockHeight,
      });

      const authenticators = await webAuthnManager.getAuthenticatorsByUser(accountId);
      const authCredential = await webAuthnManager.getAuthenticationCredentialsSerialized({
        nearAccountId: accountId,
        challenge: authChallenge,
        allowCredentials: authenticatorsToAllowCredentials(authenticators),
      });

      const vrfUnlockResult = await webAuthnManager.unlockVRFKeypair({
        nearAccountId: accountId,
        encryptedVrfKeypair: rec.encryptedVrfKeypair,
        credential: authCredential,
      });

      if (!vrfUnlockResult.success) {
        throw new Error(vrfUnlockResult.error || 'VRF unlock failed during auto-login');
      }

      await webAuthnManager.initializeCurrentUser(accountId, this.context.nearClient);
      await webAuthnManager.setLastUser(accountId, rec.deviceNumber);

      this.emit({
        step: 5,
        phase: EmailRecoveryPhase.STEP_5_FINALIZING_REGISTRATION,
        status: EmailRecoveryStatus.SUCCESS,
        message: `Welcome ${accountId}`,
        data: { autoLogin: 'success' },
      } as EmailRecoverySSEEvent & { data: Record<string, unknown> });
    } catch (err: any) {
      console.warn('[EmailRecoveryFlow] Auto-login failed after recovery', err);
      this.emit({
        step: 5,
        phase: EmailRecoveryPhase.STEP_5_FINALIZING_REGISTRATION,
        status: EmailRecoveryStatus.ERROR,
        message: 'Auto-login failed; please log in manually on this device.',
        data: { error: err?.message || String(err), autoLogin: 'error' },
      } as EmailRecoverySSEEvent & { data: Record<string, unknown> });
    }
  }
}
