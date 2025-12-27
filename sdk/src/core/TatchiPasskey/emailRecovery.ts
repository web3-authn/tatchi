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
} from '../types/sdkSentEvents';
import type { TatchiConfigs } from '../types/tatchi';
import {
  createRandomVRFChallenge,
  type EncryptedVRFKeypair,
  type ServerEncryptedVrfKeypair,
  type VRFChallenge,
} from '../types/vrf-worker';
import type { WebAuthnRegistrationCredential } from '../types';
import type { ConfirmationConfig } from '../types/signer-worker';
import { DEFAULT_WAIT_STATUS } from '../types/rpc';
import { parseDeviceNumber } from '../WebAuthnManager/SignerWorkerManager/getDeviceNumber';
import { getLoginSession } from './login';
import type { SignedTransaction } from '../NearClient';
import { EmailRecoveryPendingStore, type PendingStore } from '../EmailRecovery';

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
  requestId: string;
  encryptedVrfKeypair: EncryptedVRFKeypair;
  serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
  vrfPublicKey: string;
  credential: WebAuthnRegistrationCredential;
  vrfChallenge?: VRFChallenge;
  createdAt: number;
  status: PendingEmailRecoveryStatus;
};

type PollTickResult<T> = { done: false } | { done: true; value: T };

type PollUntilResult<T> =
  | { status: 'completed'; value: T; elapsedMs: number; pollCount: number }
  | { status: 'timedOut'; elapsedMs: number; pollCount: number }
  | { status: 'cancelled'; elapsedMs: number; pollCount: number };

type VerificationOutcome =
  | { outcome: 'verified' }
  | { outcome: 'failed'; errorMessage: string };

type AutoLoginResult =
  | { success: true; method: 'shamir' | 'touchid' }
  | { success: false; reason: string };

type StoreUserDataPayload = Parameters<PasskeyManagerContext['webAuthnManager']['storeUserData']>[0];

type AccountViewLike = {
  amount: bigint | string;
  locked: bigint | string;
  storage_usage: number | bigint;
};

type CollectedRecoveryCredential = {
  credential: WebAuthnRegistrationCredential;
  vrfChallenge?: VRFChallenge;
};

type DerivedRecoveryKeys = {
  encryptedVrfKeypair: EncryptedVRFKeypair;
  serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
  vrfPublicKey: string;
  nearPublicKey: string;
};

export interface EmailRecoveryFlowOptions {
  onEvent?: EventCallback<EmailRecoverySSEEvent>;
  onError?: (error: Error) => void;
  afterCall?: AfterCall<void>;
  pendingStore?: PendingStore;
  confirmerText?: { title?: string; body?: string };
  confirmationConfig?: Partial<ConfirmationConfig>;
}

function getEmailRecoveryConfig(configs: TatchiConfigs): {
  minBalanceYocto: string;
  pollingIntervalMs: number;
  maxPollingDurationMs: number;
  pendingTtlMs: number;
  mailtoAddress: string;
  dkimVerifierAccountId: string;
  verificationViewMethod: string;
} {
  const relayerEmailCfg = configs.relayer.emailRecovery;
  const minBalanceYocto = String(relayerEmailCfg.minBalanceYocto);
  const pollingIntervalMs = Number(relayerEmailCfg.pollingIntervalMs);
  const maxPollingDurationMs = Number(relayerEmailCfg.maxPollingDurationMs);
  const pendingTtlMs = Number(relayerEmailCfg.pendingTtlMs);
  const mailtoAddress = String(relayerEmailCfg.mailtoAddress);
  const dkimVerifierAccountId = String(relayerEmailCfg.dkimVerifierAccountId);
  const verificationViewMethod = String(relayerEmailCfg.verificationViewMethod);
  return {
    minBalanceYocto,
    pollingIntervalMs,
    maxPollingDurationMs,
    pendingTtlMs,
    mailtoAddress,
    dkimVerifierAccountId,
    verificationViewMethod,
  };
}

export function generateEmailRecoveryRequestId(): string {
  // 6-character A–Z0–9 identifier, suitable for short-lived correlation.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = 6;
  const bytes = new Uint8Array(length);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export class EmailRecoveryFlow {
  private context: PasskeyManagerContext;
  private options?: EmailRecoveryFlowOptions;
  private pendingStore: PendingStore;
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
    this.pendingStore = options?.pendingStore ?? new EmailRecoveryPendingStore({
      getPendingTtlMs: () => this.getConfig().pendingTtlMs,
    });
  }

  setOptions(options?: EmailRecoveryFlowOptions) {
    if (!options) return;
    this.options = { ...(this.options || {}), ...options };
    if (options.pendingStore) {
      this.pendingStore = options.pendingStore;
    }
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

  private async fail(step: number, message: string): Promise<never> {
    const err = this.emitError(step, message);
    await this.options?.afterCall?.(false);
    throw err;
  }

  private async assertValidAccountIdOrFail(step: number, accountId: string): Promise<AccountId> {
    const validation = validateNearAccountId(accountId as AccountId);
    if (!validation.valid) {
      await this.fail(step, `Invalid NEAR account ID: ${validation.error}`);
    }
    return toAccountId(accountId as string);
  }

  private async resolvePendingOrFail(
    step: number,
    args: { accountId: AccountId; nearPublicKey?: string },
    options?: {
      allowErrorStatus?: boolean;
      missingMessage?: string;
      errorStatusMessage?: string;
    }
  ): Promise<PendingEmailRecovery> {
    const {
      allowErrorStatus = true,
      missingMessage = 'No pending email recovery record found for this account',
      errorStatusMessage = 'Pending email recovery is in an error state; please restart the flow',
    } = options ?? {};

    let rec = this.pending;
    if (!rec || rec.accountId !== args.accountId || (args.nearPublicKey && rec.nearPublicKey !== args.nearPublicKey)) {
      rec = await this.loadPending(args.accountId, args.nearPublicKey);
      this.pending = rec;
    }

    if (!rec) {
      await this.fail(step, missingMessage);
    }

    const resolved = rec as PendingEmailRecovery;
    if (!allowErrorStatus && resolved.status === 'error') {
      await this.fail(step, errorStatusMessage);
    }

    return resolved;
  }

  private getConfig() {
    return getEmailRecoveryConfig(this.context.configs);
  }

  private toBigInt(value: bigint | number | string | null | undefined): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string' && value.length > 0) return BigInt(value);
    return BigInt(0);
  }

  private computeAvailableBalance(accountView: AccountViewLike): bigint {
    const STORAGE_PRICE_PER_BYTE = BigInt('10000000000000000000'); // 1e19 yocto NEAR per byte
    const amount = this.toBigInt(accountView.amount);
    const locked = this.toBigInt(accountView.locked);
    const storageUsage = this.toBigInt(accountView.storage_usage);
    const storageCost = storageUsage * STORAGE_PRICE_PER_BYTE;
    const rawAvailable = amount - locked - storageCost;
    return rawAvailable > 0 ? rawAvailable : BigInt(0);
  }

  private async assertSufficientBalance(nearAccountId: AccountId): Promise<void> {
    const { minBalanceYocto } = this.getConfig();

    try {
      const accountView = await this.context.nearClient.viewAccount(nearAccountId);
      const available = this.computeAvailableBalance(accountView);
      if (available < BigInt(minBalanceYocto)) {
        await this.fail(
          1,
          `This account does not have enough NEAR to finalize recovery. Available: ${available.toString()} yocto; required: ${String(minBalanceYocto)}. Please top up and try again.`
        );
      }
    } catch (e: any) {
      await this.fail(1, e?.message || 'Failed to fetch account balance for recovery');
    }
  }

  private async getCanonicalRecoveryEmailOrFail(recoveryEmail: string): Promise<string> {
    const canonicalEmail = String(recoveryEmail || '').trim().toLowerCase();
    if (!canonicalEmail) {
      await this.fail(1, 'Recovery email is required for email-based account recovery');
    }
    return canonicalEmail;
  }

  private async getNextDeviceNumberFromContract(nearAccountId: AccountId): Promise<number> {
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
      return max + 1;
    } catch {
      return 1;
    }
  }

  private async collectRecoveryCredentialOrFail(
    nearAccountId: AccountId,
    deviceNumber: number
  ): Promise<CollectedRecoveryCredential> {
    const confirmerText = {
      title: this.options?.confirmerText?.title ?? 'Register New Recovery Account',
      body: this.options?.confirmerText?.body ?? 'Create a recovery account and send an encrypted email to recover your account.',
    };
    const confirm = await this.context.webAuthnManager.requestRegistrationCredentialConfirmation({
      nearAccountId,
      deviceNumber,
      confirmerText,
      confirmationConfigOverride: this.options?.confirmationConfig,
    });

    if (!confirm.confirmed || !confirm.credential) {
      await this.fail(2, 'User cancelled email recovery TouchID confirmation');
    }

    return {
      credential: confirm.credential,
      vrfChallenge: confirm.vrfChallenge || undefined,
    };
  }

  private async deriveRecoveryKeysOrFail(
    nearAccountId: AccountId,
    deviceNumber: number,
    credential: WebAuthnRegistrationCredential
  ): Promise<DerivedRecoveryKeys> {
    const vrfDerivationResult = await this.context.webAuthnManager.deriveVrfKeypair({
      credential,
      nearAccountId,
    });

    if (!vrfDerivationResult.success || !vrfDerivationResult.encryptedVrfKeypair) {
      await this.fail(2, 'Failed to derive VRF keypair from PRF for email recovery');
    }

    const nearKeyResult = await this.context.webAuthnManager.deriveNearKeypairAndEncryptFromSerialized({
      nearAccountId,
      credential,
      options: { deviceNumber },
    });

    if (!nearKeyResult.success || !nearKeyResult.publicKey) {
      await this.fail(2, 'Failed to derive NEAR keypair for email recovery');
    }

    return {
      encryptedVrfKeypair: vrfDerivationResult.encryptedVrfKeypair,
      serverEncryptedVrfKeypair: vrfDerivationResult.serverEncryptedVrfKeypair || null,
      vrfPublicKey: vrfDerivationResult.vrfPublicKey,
      nearPublicKey: nearKeyResult.publicKey,
    };
  }

  private emitAwaitEmail(rec: PendingEmailRecovery, mailtoUrl: string): void {
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
        requestId: rec.requestId,
        mailtoUrl,
      },
    } as EmailRecoverySSEEvent & { data: Record<string, unknown> });
  }

  private emitAutoLoginEvent(
    status: EmailRecoveryStatus,
    message: string,
    data: Record<string, unknown>
  ): void {
    this.emit({
      step: 5,
      phase: EmailRecoveryPhase.STEP_5_FINALIZING_REGISTRATION,
      status,
      message,
      data,
    } as EmailRecoverySSEEvent & { data: Record<string, unknown> });
  }

  private async checkViaDkimViewMethod(
    rec: PendingEmailRecovery
  ): Promise<{ completed: boolean; success: boolean; errorMessage?: string; transactionHash?: string } | null> {
    const { dkimVerifierAccountId, verificationViewMethod } = this.getConfig();
    if (!dkimVerifierAccountId) return null;

    try {
      const { getEmailRecoveryVerificationResult } = await import('../rpcCalls');
      const result = await getEmailRecoveryVerificationResult(
        this.context.nearClient,
        dkimVerifierAccountId,
        verificationViewMethod,
        rec.requestId
      );

      if (!result) {
        return { completed: false, success: false };
      }

      if (!result.verified) {
        const errorMessage = result.error_message || result.error_code || 'Email verification failed on relayer/contract';
        return {
          completed: true,
          success: false,
          errorMessage,
          transactionHash: result.transaction_hash,
        };
      }

      // Optional safety checks: ensure the bound account/key match expectations when available.
      if (result.account_id && result.account_id !== rec.accountId) {
        return {
          completed: true,
          success: false,
          errorMessage: 'Email verification account_id does not match requested account.',
          transactionHash: result.transaction_hash,
        };
      }
      if (result.new_public_key && result.new_public_key !== rec.nearPublicKey) {
        return {
          completed: true,
          success: false,
          errorMessage: 'Email verification new_public_key does not match expected recovery key.',
          transactionHash: result.transaction_hash,
        };
      }

      return {
        completed: true,
        success: true,
        transactionHash: result.transaction_hash
      };
    } catch (err) {
      // Treat view errors as retryable; keep polling the view method.
      // eslint-disable-next-line no-console
      console.warn('[EmailRecoveryFlow] get_verification_result view failed; will retry', err);
      return null;
    }
  }

  private buildPollingEventData(
    rec: PendingEmailRecovery,
    details: { transactionHash?: string; elapsedMs: number; pollCount: number }
  ): Record<string, unknown> {
    return {
      accountId: rec.accountId,
      requestId: rec.requestId,
      nearPublicKey: rec.nearPublicKey,
      transactionHash: details.transactionHash,
      elapsedMs: details.elapsedMs,
      pollCount: details.pollCount,
    };
  }

  private async sleepForPollInterval(ms: number): Promise<void> {
    await new Promise<void>(resolve => {
      this.pollIntervalResolver = resolve;
      this.pollingTimer = setTimeout(() => {
        this.pollIntervalResolver = undefined;
        this.pollingTimer = undefined;
        resolve();
      }, ms);
    }).finally(() => {
      this.pollIntervalResolver = undefined;
    });
  }

  private async pollUntil<T>(args: {
    intervalMs: number;
    timeoutMs: number;
    isCancelled: () => boolean;
    tick: (ctx: { elapsedMs: number; pollCount: number }) => Promise<PollTickResult<T>>;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  }): Promise<PollUntilResult<T>> {
    const now = args.now ?? Date.now;
    const sleep = args.sleep ?? this.sleepForPollInterval.bind(this);
    const startedAt = now();
    let pollCount = 0;

    while (!args.isCancelled()) {
      pollCount += 1;
      const elapsedMs = now() - startedAt;
      if (elapsedMs > args.timeoutMs) {
        return { status: 'timedOut', elapsedMs, pollCount };
      }

      const result = await args.tick({ elapsedMs, pollCount });
      if (result.done) {
        return { status: 'completed', value: result.value, elapsedMs, pollCount };
      }

      if (args.isCancelled()) {
        return { status: 'cancelled', elapsedMs, pollCount };
      }

      await sleep(args.intervalMs);
    }

    const elapsedMs = now() - startedAt;
    return { status: 'cancelled', elapsedMs, pollCount };
  }

  private async loadPending(
    accountId: AccountId,
    nearPublicKey?: string
  ): Promise<PendingEmailRecovery | null> {
    return this.pendingStore.get(accountId, nearPublicKey);
  }

  private async savePending(rec: PendingEmailRecovery): Promise<void> {
    await this.pendingStore.set(rec);
    this.pending = rec;
  }

  private async clearPending(accountId: AccountId, nearPublicKey?: string): Promise<void> {
    await this.pendingStore.clear(accountId, nearPublicKey);

    if (
      this.pending
      && this.pending.accountId === accountId
      && (!nearPublicKey || this.pending.nearPublicKey === nearPublicKey)
    ) {
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

    const nearAccountId = await this.assertValidAccountIdOrFail(3, accountId);
    const rec = await this.resolvePendingOrFail(
      3,
      { accountId: nearAccountId, nearPublicKey },
      { allowErrorStatus: false }
    );

    if (rec.status === 'finalizing' || rec.status === 'complete') {
      await this.fail(3, 'Recovery email has already been processed on-chain for this request');
    }

    const mailtoUrl =
      rec.status === 'awaiting-email'
        ? await this.buildMailtoUrlAndUpdateStatus(rec)
        : this.buildMailtoUrlInternal(rec);
    this.emitAwaitEmail(rec, mailtoUrl);
    await this.options?.afterCall?.(true, undefined);
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

    const nearAccountId = await this.assertValidAccountIdOrFail(1, accountId);
    await this.assertSufficientBalance(nearAccountId);
    const canonicalEmail = await this.getCanonicalRecoveryEmailOrFail(recoveryEmail);

    // Determine deviceNumber from on-chain authenticators
    const deviceNumber = await this.getNextDeviceNumberFromContract(nearAccountId);

    this.phase = EmailRecoveryPhase.STEP_2_TOUCH_ID_REGISTRATION;
    this.emit({
      step: 2,
      phase: EmailRecoveryPhase.STEP_2_TOUCH_ID_REGISTRATION,
      status: EmailRecoveryStatus.PROGRESS,
      message: 'Collecting passkey for email recovery...',
    });

    try {
      const confirm = await this.collectRecoveryCredentialOrFail(nearAccountId, deviceNumber);
      const derivedKeys = await this.deriveRecoveryKeysOrFail(nearAccountId, deviceNumber, confirm.credential);

      const rec: PendingEmailRecovery = {
        accountId: nearAccountId,
        recoveryEmail: canonicalEmail,
        deviceNumber,
        nearPublicKey: derivedKeys.nearPublicKey,
        requestId: generateEmailRecoveryRequestId(),
        encryptedVrfKeypair: derivedKeys.encryptedVrfKeypair,
        serverEncryptedVrfKeypair: derivedKeys.serverEncryptedVrfKeypair,
        vrfPublicKey: derivedKeys.vrfPublicKey,
        credential: confirm.credential,
        vrfChallenge: confirm.vrfChallenge || undefined,
        createdAt: Date.now(),
        status: 'awaiting-email',
      };

      const mailtoUrl = await this.buildMailtoUrlAndUpdateStatus(rec);

      this.emitAwaitEmail(rec, mailtoUrl);

      await this.options?.afterCall?.(true, undefined);

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
    const subject = encodeURIComponent(`recover-${rec.requestId} ${rec.accountId} ${rec.nearPublicKey}`);
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

    const nearAccountId = await this.assertValidAccountIdOrFail(4, accountId);
    const rec = await this.resolvePendingOrFail(
      4,
      { accountId: nearAccountId, nearPublicKey },
      { allowErrorStatus: false }
    );
    if (rec.status === 'complete' || rec.status === 'finalizing') {
      await this.options?.afterCall?.(true, undefined);
      return;
    }
    if (rec.status === 'awaiting-email') {
      await this.buildMailtoUrlAndUpdateStatus(rec);
    }

    await this.pollUntilAddKey(rec);
    await this.options?.afterCall?.(true, undefined);
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

  /**
   * Best-effort cancellation and local state reset so callers can retry.
   * This does not remove any passkey created in the browser/OS (WebAuthn has no delete API),
   * but it will stop polling and clear the pending IndexedDB record for the given key.
   */
  async cancelAndReset(args?: { accountId?: string; nearPublicKey?: string }): Promise<void> {
    this.stopPolling();

    const normalizedAccountId = (args?.accountId || this.pending?.accountId || '').toString().trim();
    const nearPublicKey = (args?.nearPublicKey || this.pending?.nearPublicKey || '').toString().trim();

    if (normalizedAccountId) {
      try {
        await this.clearPending(toAccountId(normalizedAccountId), nearPublicKey);
      } catch {
        // best-effort
      }
    }

    this.pending = null;
    this.error = undefined;
    this.phase = EmailRecoveryPhase.STEP_1_PREPARATION;
  }

  async finalize(args: { accountId: string; nearPublicKey?: string }): Promise<void> {
    const { accountId, nearPublicKey } = args;
    this.cancelled = false;
    this.error = undefined;

    const nearAccountId = await this.assertValidAccountIdOrFail(4, accountId);
    const rec = await this.resolvePendingOrFail(
      4,
      { accountId: nearAccountId, nearPublicKey },
      { allowErrorStatus: true }
    );

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
      await this.options?.afterCall?.(true, undefined);
      return;
    }

    // Ensure verification has completed successfully before finalizing registration.
    await this.pollUntilAddKey(rec);
    await this.finalizeRegistration(rec);
    await this.options?.afterCall?.(true, undefined);
  }

  private async pollUntilAddKey(rec: PendingEmailRecovery): Promise<void> {
    const { pollingIntervalMs, maxPollingDurationMs, dkimVerifierAccountId } = this.getConfig();
    if (!dkimVerifierAccountId) {
      const err = this.emitError(4, 'Email recovery verification contract (dkimVerifierAccountId) is not configured');
      await this.options?.afterCall?.(false);
      throw err;
    }
    this.phase = EmailRecoveryPhase.STEP_4_POLLING_VERIFICATION_RESULT;
    this.pollingStartedAt = Date.now();

    const pollResult = await this.pollUntil<VerificationOutcome>({
      intervalMs: pollingIntervalMs,
      timeoutMs: maxPollingDurationMs,
      isCancelled: () => this.cancelled,
      tick: async ({ elapsedMs, pollCount }) => {
        const verification = await this.checkViaDkimViewMethod(rec);
        const completed = verification?.completed === true;
        const success = verification?.success === true;

        this.emit({
          step: 4,
          phase: EmailRecoveryPhase.STEP_4_POLLING_VERIFICATION_RESULT,
          status: EmailRecoveryStatus.PROGRESS,
          message: completed && success
            ? `Email verified for request ${rec.requestId}; finalizing registration`
            : `Waiting for email verification for request ${rec.requestId}`,
          data: this.buildPollingEventData(rec, {
            transactionHash: verification?.transactionHash,
            elapsedMs,
            pollCount,
          }),
        } as EmailRecoverySSEEvent & { data: Record<string, unknown> });

        if (!completed) {
          return { done: false };
        }

        if (!success) {
          return {
            done: true,
            value: {
              outcome: 'failed',
              errorMessage: verification?.errorMessage || 'Email verification failed',
            },
          };
        }

        return { done: true, value: { outcome: 'verified' } };
      },
    });

    if (pollResult.status === 'completed') {
      if (pollResult.value.outcome === 'failed') {
        const err = this.emitError(4, pollResult.value.errorMessage);
        rec.status = 'error';
        await this.savePending(rec);
        await this.options?.afterCall?.(false);
        throw err;
      }

      rec.status = 'finalizing';
      await this.savePending(rec);
      return;
    }

    if (pollResult.status === 'timedOut') {
      const err = this.emitError(4, 'Timed out waiting for recovery email to be processed on-chain');
      rec.status = 'error';
      await this.savePending(rec);
      await this.options?.afterCall?.(false);
      throw err;
    }

    const err = this.emitError(4, 'Email recovery polling was cancelled');
    await this.options?.afterCall?.(false);
    throw err;
  }

  private initializeNonceManager(
    rec: PendingEmailRecovery
  ): {
    nonceManager: ReturnType<PasskeyManagerContext['webAuthnManager']['getNonceManager']>;
    accountId: AccountId;
  } {
    const nonceManager = this.context.webAuthnManager.getNonceManager();
    const accountId = toAccountId(rec.accountId);
    nonceManager.initializeUser(accountId, rec.nearPublicKey);
    return { nonceManager, accountId };
  }

  private async signRegistrationTx(rec: PendingEmailRecovery, accountId: AccountId): Promise<SignedTransaction> {
    const vrfChallenge = rec.vrfChallenge;
    if (!vrfChallenge) {
      return this.fail(5, 'Missing VRF challenge for email recovery registration');
    }

    const registrationResult = await this.context.webAuthnManager.signDevice2RegistrationWithStoredKey({
      nearAccountId: accountId,
      credential: rec.credential,
      vrfChallenge,
      deterministicVrfPublicKey: rec.vrfPublicKey,
      deviceNumber: rec.deviceNumber,
    });

    if (!registrationResult.success || !registrationResult.signedTransaction) {
      await this.fail(5, registrationResult.error || 'Failed to sign email recovery registration transaction');
    }

    return registrationResult.signedTransaction;
  }

  private async broadcastRegistrationTxAndWaitFinal(
    rec: PendingEmailRecovery,
    signedTx: SignedTransaction
  ): Promise<string | undefined> {
    try {
      const txResult = await this.context.nearClient.sendTransaction(
        signedTx,
        DEFAULT_WAIT_STATUS.linkDeviceRegistration
      );

      try {
        const txHash = (txResult as any)?.transaction?.hash || (txResult as any)?.transaction_hash;
        if (txHash) {
          this.emit({
            step: 5,
            phase: EmailRecoveryPhase.STEP_5_FINALIZING_REGISTRATION,
            status: EmailRecoveryStatus.PROGRESS,
            message: 'Registration transaction confirmed',
            data: {
              accountId: rec.accountId,
              nearPublicKey: rec.nearPublicKey,
              transactionHash: txHash,
            },
          } as EmailRecoverySSEEvent & { data: Record<string, unknown> });
        }
        return txHash;
      } catch {
        // best-effort; do not fail flow
      }
    } catch (e: any) {
      const msg = String(e?.message || '');
      await this.fail(
        5,
        msg || 'Failed to broadcast email recovery registration transaction (insufficient funds or RPC error)'
      );
    }

    return undefined;
  }

  private async persistRecoveredUserRecordBestEffort(
    rec: PendingEmailRecovery,
    accountId: AccountId
  ): Promise<boolean> {
    try {
      await IndexedDBManager.clientDB.storeWebAuthnUserData({
        nearAccountId: accountId,
        deviceNumber: rec.deviceNumber,
        clientNearPublicKey: rec.nearPublicKey,
        passkeyCredential: {
          id: rec.credential.id,
          rawId: rec.credential.rawId,
        },
        encryptedVrfKeypair: rec.encryptedVrfKeypair,
        serverEncryptedVrfKeypair: rec.serverEncryptedVrfKeypair || undefined,
      });
      return true;
    } catch (err) {
      console.warn('[EmailRecoveryFlow] Failed to store recovery user record:', err);
      return false;
    }
  }

  private mapAuthenticatorsFromContract(authenticators: Array<{ authenticator: any }>) {
    return authenticators.map(({ authenticator }) => ({
      credentialId: authenticator.credentialId,
      credentialPublicKey: authenticator.credentialPublicKey,
      transports: authenticator.transports,
      name: authenticator.name,
      registered: authenticator.registered.toISOString(),
      vrfPublicKey: authenticator.vrfPublicKeys?.[0] || '',
      deviceNumber: authenticator.deviceNumber,
    }));
  }

  private async syncAuthenticatorsBestEffort(accountId: AccountId): Promise<boolean> {
    try {
      const { syncAuthenticatorsContractCall } = await import('../rpcCalls');
      const authenticators = await syncAuthenticatorsContractCall(
        this.context.nearClient,
        this.context.configs.contractId,
        accountId
      );

      const mappedAuthenticators = this.mapAuthenticatorsFromContract(authenticators);
      await IndexedDBManager.clientDB.syncAuthenticatorsFromContract(accountId, mappedAuthenticators);
      return true;
    } catch (err) {
      console.warn('[EmailRecoveryFlow] Failed to sync authenticators after recovery:', err);
      return false;
    }
  }

  private async setLastUserBestEffort(accountId: AccountId, deviceNumber: number): Promise<boolean> {
    try {
      await IndexedDBManager.clientDB.setLastUser(accountId, deviceNumber);
      return true;
    } catch (err) {
      console.warn('[EmailRecoveryFlow] Failed to set last user after recovery:', err);
      return false;
    }
  }

  private async updateNonceBestEffort(
    nonceManager: ReturnType<PasskeyManagerContext['webAuthnManager']['getNonceManager']>,
    signedTx: SignedTransaction
  ): Promise<void> {
    try {
      const txNonce = (signedTx.transaction as any)?.nonce;
      if (txNonce != null) {
        await nonceManager.updateNonceFromBlockchain(
          this.context.nearClient,
          String(txNonce)
        );
      }
    } catch {
      // best-effort; do not fail flow
    }
  }

  private async persistRecoveredUserData(rec: PendingEmailRecovery, accountId: AccountId): Promise<void> {
    const { webAuthnManager } = this.context;

    const payload: StoreUserDataPayload = {
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
    };

    await webAuthnManager.storeUserData(payload);
  }

  private async persistAuthenticatorBestEffort(rec: PendingEmailRecovery, accountId: AccountId): Promise<void> {
    try {
      const { webAuthnManager } = this.context;
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
  }

  private async markCompleteAndClearPending(rec: PendingEmailRecovery): Promise<void> {
    rec.status = 'complete';
    await this.savePending(rec);
    await this.clearPending(rec.accountId, rec.nearPublicKey);
  }

  private async assertVrfActiveForAccount(accountId: AccountId, message: string): Promise<void> {
    const vrfStatus = await this.context.webAuthnManager.checkVrfStatus();
    const vrfActiveForAccount =
      vrfStatus.active
      && vrfStatus.nearAccountId
      && String(vrfStatus.nearAccountId) === String(accountId);
    if (!vrfActiveForAccount) {
      throw new Error(message);
    }
  }

  private async finalizeLocalLoginState(accountId: AccountId, deviceNumber: number): Promise<void> {
    const { webAuthnManager } = this.context;
    await webAuthnManager.setLastUser(accountId, deviceNumber);
    await webAuthnManager.initializeCurrentUser(accountId, this.context.nearClient);
    try { await getLoginSession(this.context, accountId); } catch { }
  }

  private async tryShamirUnlock(
    rec: PendingEmailRecovery,
    accountId: AccountId,
    deviceNumber: number
  ): Promise<boolean> {
    if (
      !rec.serverEncryptedVrfKeypair
      || !rec.serverEncryptedVrfKeypair.serverKeyId
      || !this.context.configs.vrfWorkerConfigs?.shamir3pass?.relayServerUrl
    ) {
      return false;
    }

    try {
      const { webAuthnManager } = this.context;
      const unlockResult = await webAuthnManager.shamir3PassDecryptVrfKeypair({
        nearAccountId: accountId,
        kek_s_b64u: rec.serverEncryptedVrfKeypair.kek_s_b64u,
        ciphertextVrfB64u: rec.serverEncryptedVrfKeypair.ciphertextVrfB64u,
        serverKeyId: rec.serverEncryptedVrfKeypair.serverKeyId,
      });

      if (!unlockResult.success) {
        return false;
      }

      await this.assertVrfActiveForAccount(accountId, 'VRF session inactive after Shamir3Pass unlock');
      await this.finalizeLocalLoginState(accountId, deviceNumber);
      return true;
    } catch (err) {
      console.warn('[EmailRecoveryFlow] Shamir 3-pass unlock failed, falling back to TouchID', err);
      return false;
    }
  }

  private async tryTouchIdUnlock(
    rec: PendingEmailRecovery,
    accountId: AccountId,
    deviceNumber: number
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      const { webAuthnManager } = this.context;
      const authChallenge = createRandomVRFChallenge() as VRFChallenge;

      const storedCredentialId = String(rec.credential?.rawId || rec.credential?.id || '').trim();
      const credentialIds = storedCredentialId ? [storedCredentialId] : [];
      const authenticators = credentialIds.length > 0
        ? []
        : await webAuthnManager.getAuthenticatorsByUser(accountId);
      const authCredential = await webAuthnManager.getAuthenticationCredentialsSerializedDualPrf({
        nearAccountId: accountId,
        challenge: authChallenge,
        credentialIds: credentialIds.length > 0 ? credentialIds : authenticators.map((a) => a.credentialId),
      });

      if (storedCredentialId && authCredential.rawId !== storedCredentialId) {
        return {
          success: false,
          reason: 'Wrong passkey selected during recovery auto-login; please use the newly recovered passkey.',
        };
      }

      const vrfUnlockResult = await webAuthnManager.unlockVRFKeypair({
        nearAccountId: accountId,
        encryptedVrfKeypair: rec.encryptedVrfKeypair,
        credential: authCredential,
      });

      if (!vrfUnlockResult.success) {
        return { success: false, reason: vrfUnlockResult.error || 'VRF unlock failed during auto-login' };
      }

      await this.assertVrfActiveForAccount(accountId, 'VRF session inactive after TouchID unlock');
      await this.finalizeLocalLoginState(accountId, deviceNumber);
      return { success: true };
    } catch (err: any) {
      return { success: false, reason: err?.message || String(err) };
    }
  }

  private async handleAutoLoginFailure(reason: string, err?: unknown): Promise<AutoLoginResult> {
    console.warn('[EmailRecoveryFlow] Auto-login failed after recovery', err ?? reason);
    try {
      await this.context.webAuthnManager.clearVrfSession();
    } catch { }
    return { success: false, reason };
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

    try {
      const { nonceManager, accountId } = this.initializeNonceManager(rec);
      const signedTx = await this.signRegistrationTx(rec, accountId);
      const txHash = await this.broadcastRegistrationTxAndWaitFinal(rec, signedTx);

      if (txHash) {
        const storedUser = await this.persistRecoveredUserRecordBestEffort(rec, accountId);
        if (storedUser) {
          const syncedAuthenticators = await this.syncAuthenticatorsBestEffort(accountId);
          if (syncedAuthenticators) {
            await this.setLastUserBestEffort(accountId, rec.deviceNumber);
          }
        }
      }

      await this.updateNonceBestEffort(nonceManager, signedTx);
      await this.persistRecoveredUserData(rec, accountId);
      await this.persistAuthenticatorBestEffort(rec, accountId);

      this.emitAutoLoginEvent(EmailRecoveryStatus.PROGRESS, 'Attempting auto-login with recovered device...', {
        autoLogin: 'progress',
      });

      const autoLoginResult = await this.attemptAutoLogin(rec);
      if (autoLoginResult.success) {
        this.emitAutoLoginEvent(EmailRecoveryStatus.SUCCESS, `Welcome ${accountId}`, {
          autoLogin: 'success',
        });
      } else {
        this.emitAutoLoginEvent(EmailRecoveryStatus.ERROR, 'Auto-login failed; please log in manually on this device.', {
          error: autoLoginResult.reason,
          autoLogin: 'error',
        });
      }

      await this.markCompleteAndClearPending(rec);

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

  private async attemptAutoLogin(rec: PendingEmailRecovery): Promise<AutoLoginResult> {
    try {
      const accountId = toAccountId(rec.accountId);
      const deviceNumber = parseDeviceNumber(rec.deviceNumber, { min: 1 });
      if (deviceNumber === null) {
        return this.handleAutoLoginFailure(
          `Invalid deviceNumber for auto-login: ${String(rec.deviceNumber)}`
        );
      }

      const shamirUnlocked = await this.tryShamirUnlock(rec, accountId, deviceNumber);
      if (shamirUnlocked) {
        return { success: true, method: 'shamir' };
      }

      const touchIdResult = await this.tryTouchIdUnlock(rec, accountId, deviceNumber);
      if (touchIdResult.success) {
        return { success: true, method: 'touchid' };
      }

      return this.handleAutoLoginFailure(touchIdResult.reason || 'Auto-login failed');
    } catch (err: any) {
      return this.handleAutoLoginFailure(err?.message || String(err), err);
    }
  }
}
