import type { PasskeyManagerContext } from './index';
import { IndexedDBManager } from '../IndexedDBManager';
import { validateNearAccountId } from '../../utils/validation';
import { errorMessage } from '../../utils/errors';
import { toAccountId, type AccountId } from '../types/accountIds';
import {
  EmailRecoveryPhase,
  EmailRecoveryStatus,
  type EmailRecoverySSEEvent,
} from '../types/sdkSentEvents';
import type { TatchiConfigs } from '../types/tatchi';
import {
  createRandomVRFChallenge,
  type VRFChallenge,
} from '../types/vrf-worker';
import type { FinalExecutionOutcome } from '@near-js/types';
import type { StoredAuthenticator, WebAuthnRegistrationCredential } from '../types';
import { DEFAULT_WAIT_STATUS } from '../types/rpc';
import { parseDeviceNumber } from '../WebAuthnManager/SignerWorkerManager/getDeviceNumber';
import { getLoginSession } from './login';
import type { SignedTransaction } from '../NearClient';
import {
  EmailRecoveryPendingStore,
  parseLinkDeviceRegisterUserResponse,
  type PendingStore,
} from '../EmailRecovery';
import {
  EmailRecoveryError,
  EmailRecoveryErrorCode,
  generateEmailRecoveryRequestId,
  type EmailRecoveryFlowOptions,
  type PendingEmailRecovery,
  type PendingEmailRecoveryStatus,
  type PollTickResult,
  type PollUntilResult,
  type VerificationOutcome,
  type AutoLoginResult,
  type StoreUserDataPayload,
  type AccountViewLike,
  type CollectedRecoveryCredential,
  type DerivedRecoveryKeys,
} from '../types/emailRecovery';
import {
  syncAuthenticatorsContractCall,
  getEmailRecoveryAttempt,
  thresholdEd25519KeygenFromRegistrationTx
} from '../rpcCalls';
import { ensureEd25519Prefix } from '../nearCrypto';
import { buildThresholdEd25519Participants2pV1 } from '../../threshold/participants';
import { persistInitialThemePreferenceFromWalletTheme } from './themePreference';

export class EmailRecoveryFlow {
  private context: PasskeyManagerContext;
  private options?: EmailRecoveryFlowOptions;
  private pendingStore: PendingStore;
  private pending: PendingEmailRecovery | null = null;
  private phase: EmailRecoveryPhase = EmailRecoveryPhase.STEP_1_PREPARATION;
  private pollingTimer: ReturnType<typeof setTimeout> | undefined;
  private pollIntervalResolver?: () => void;
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

  private emitError(step: number, messageOrError: string | Error): Error {
    const err = typeof messageOrError === 'string' ? new Error(messageOrError) : messageOrError;
    const message = err.message || (typeof messageOrError === 'string' ? messageOrError : 'Unknown error');
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
    const relayConfig = this.context.configs.relayer.emailRecovery;
    return {
      minBalanceYocto: String(relayConfig.minBalanceYocto),
      pollingIntervalMs: Number(relayConfig.pollingIntervalMs),
      maxPollingDurationMs: Number(relayConfig.maxPollingDurationMs),
      pendingTtlMs: Number(relayConfig.pendingTtlMs),
      mailtoAddress: String(relayConfig.mailtoAddress),
    };
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
    } catch (err: unknown) {
      await this.fail(1, errorMessage(err) || 'Failed to fetch account balance for recovery');
    }
  }

  private async getNextDeviceNumberFromContract(nearAccountId: AccountId): Promise<number> {
    try {
      const authenticators = await syncAuthenticatorsContractCall(
        this.context.nearClient,
        this.context.configs.contractId,
        nearAccountId
      );
      const numbers = authenticators
        .map(({ authenticator }) => authenticator.deviceNumber)
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
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

  private async checkViaEmailRecovererAttempt(
    rec: PendingEmailRecovery
  ): Promise<{ completed: boolean; success: boolean; missing?: boolean; errorMessage?: string; } | null> {
    try {
      const attempt = await getEmailRecoveryAttempt(
        this.context.nearClient,
        rec.accountId,
        rec.requestId
      );

      if (!attempt) {
        return { completed: false, success: false, missing: true };
      }

      // Optional safety checks: ensure the bound request/key match expectations when available.
      if (attempt.request_id && attempt.request_id !== rec.requestId) {
        return {
          completed: true,
          success: false,
          errorMessage: 'Email recovery attempt request_id does not match requested requestId.',
        };
      }

      if (attempt.new_public_key && attempt.new_public_key !== rec.nearPublicKey) {
        const expected = ensureEd25519Prefix(rec.nearPublicKey);
        const actual = ensureEd25519Prefix(attempt.new_public_key);

        // The relayer/prover often forwards only the base58 part while the SDK
        // persists `ed25519:<base58>`. Compare normalized forms to avoid false
        // mismatches from prefix formatting differences.
        if (actual === expected) {
          // no-op; treat as matching
        } else {
          return {
            completed: true,
            success: false,
            errorMessage:
              `Email recovery new_public_key mismatch for request ${rec.requestId}. ` +
              `Expected ${expected}; got ${actual}. ` +
              'This usually means the recovery email you sent was generated for a different device/attempt.',
          };
        }
      }

      const normalized = attempt.status.toLowerCase();

      if (normalized === 'complete' || normalized === 'completed') {
        return {
          completed: true,
          success: true,
        };
      }

      if (normalized.includes('failed')) {
        return {
          completed: true,
          success: false,
          errorMessage: attempt.error || `Email recovery failed (${attempt.status || 'unknown status'})`,
        };
      }

      return {
        completed: false,
        success: false,
      };
    } catch (err) {
      if (isCodeDoesNotExistError(err)) {
        return {
          completed: true,
          success: false,
          errorMessage:
            `Email recovery is not set up for ${rec.accountId} yet (Email Recoverer contract is not deployed). ` +
            'Please configure email recovery for this account before attempting recovery.',
        };
      }

      // Treat view errors as retryable; keep polling the view method.
      // eslint-disable-next-line no-console
      console.warn('[EmailRecoveryFlow] get_recovery_attempt view failed; will retry', err);
      return null;
    }
  }

  private async isRecoveryAccessKeyPresent(rec: PendingEmailRecovery): Promise<boolean | null> {
    try {
      await this.context.nearClient.viewAccessKey(rec.accountId, rec.nearPublicKey);
      return true;
    } catch (err: any) {
      const kind = typeof err?.kind === 'string' ? String(err.kind) : '';
      const short = typeof err?.short === 'string' ? String(err.short) : '';
      const msg = typeof err?.message === 'string' ? String(err.message) : '';

      if (
        /AccessKeyDoesNotExist/i.test(kind) ||
        /AccessKeyDoesNotExist/i.test(short) ||
        /access key does not exist/i.test(msg) ||
        /access key .*does not exist/i.test(msg)
      ) {
        return false;
      }

      // Unexpected view error: retryable; treat as unknown to avoid failing the flow.
      // eslint-disable-next-line no-console
      console.warn('[EmailRecoveryFlow] view_access_key failed while checking recovery key; will retry', err);
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

  async start(args: { accountId: string }): Promise<{ mailtoUrl: string; nearPublicKey: string }> {
    const { accountId } = args;
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
    } catch (e: unknown) {
      const err = this.emitError(2, errorMessage(e) || 'Email recovery TouchID/derivation failed');
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
    const { pollingIntervalMs, maxPollingDurationMs } = this.getConfig();
    this.phase = EmailRecoveryPhase.STEP_4_POLLING_VERIFICATION_RESULT;
    this.pollingStartedAt = Date.now();
    let sawAttempt = false;

    const pollResult = await this.pollUntil<VerificationOutcome>({
      intervalMs: pollingIntervalMs,
      timeoutMs: maxPollingDurationMs,
      isCancelled: () => this.cancelled,
      tick: async ({ elapsedMs, pollCount }) => {
        const verification = await this.checkViaEmailRecovererAttempt(rec);
        if (verification && !verification.missing) {
          sawAttempt = true;
        }

        let completed = verification?.completed === true;
        let success = verification?.success === true;
        let errorMessage = verification?.errorMessage;
        let transactionHash: string | undefined;

        if (verification?.missing) {
          const hasKey = await this.isRecoveryAccessKeyPresent(rec);
          if (hasKey === true) {
            completed = true;
            success = true;
          } else if (hasKey === false && sawAttempt) {
            completed = true;
            success = false;
            errorMessage =
              'Email recovery attempt was cleared on-chain before completion. Please resend the recovery email or restart the flow.';
          } else if (hasKey === null) {
            // Retry on unexpected view errors while checking access key presence.
            return { done: false };
          }
        }

        this.emit({
          step: 4,
          phase: EmailRecoveryPhase.STEP_4_POLLING_VERIFICATION_RESULT,
          status: EmailRecoveryStatus.PROGRESS,
          message: completed && success
            ? `Email recovery completed for request ${rec.requestId}; finalizing registration`
            : `Waiting for email recovery for request ${rec.requestId}`,
          data: this.buildPollingEventData(rec, {
            transactionHash,
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
              errorMessage: errorMessage || 'Email recovery failed',
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

  /*
   * Signs a `link_device_register_user` contract call
   */
  private async signNewDevice2RegistrationTx(rec: PendingEmailRecovery, accountId: AccountId): Promise<SignedTransaction> {
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
    let txResult: FinalExecutionOutcome;
    try {
      txResult = await this.context.nearClient.sendTransaction(
        signedTx,
        DEFAULT_WAIT_STATUS.linkDeviceRegistration
      );
    } catch (err: unknown) {
      const msg = errorMessage(err) || 'Failed to broadcast email recovery registration transaction (insufficient funds or RPC error)';
      throw new Error(msg);
    }

    const txHash = this.getTxHash(txResult);

    // Contract can return `{ verified: false, registration_info: null }` without failing the tx.
    // When that happens, the authenticator was NOT registered on-chain, so we must not proceed
    // with local persistence + auto-login.
    const linkDeviceResult = parseLinkDeviceRegisterUserResponse(txResult);
    if (linkDeviceResult?.verified === false) {
      const logs = this.extractNearExecutionLogs(txResult);
      const isStaleChallenge = logs.some((log) => /StaleChallenge|freshness validation failed/i.test(log));
      const txHint = txHash ? ` (tx: ${txHash})` : '';
      const code = isStaleChallenge
        ? EmailRecoveryErrorCode.VRF_CHALLENGE_EXPIRED
        : EmailRecoveryErrorCode.REGISTRATION_NOT_VERIFIED;
      const message = isStaleChallenge
        ? `Timed out finalizing registration (VRF challenge expired). Please restart email recovery and try again${txHint}.`
        : `Registration did not verify on-chain. Please try again${txHint}.`;
      throw new EmailRecoveryError(message, code, {
        accountId: rec.accountId,
        nearPublicKey: rec.nearPublicKey,
        transactionHash: txHash,
        logs,
        result: linkDeviceResult,
      });
    }

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
  }

  private getTxHash(outcome: FinalExecutionOutcome): string | undefined {
    const txUnknown: unknown = outcome.transaction;
    if (txUnknown && typeof txUnknown === 'object') {
      const hash = (txUnknown as Record<string, unknown>).hash;
      if (typeof hash === 'string' && hash.length > 0) return hash;
    }

    const txOutcomeId = (outcome as unknown as { transaction_outcome?: unknown })?.transaction_outcome;
    if (txOutcomeId && typeof txOutcomeId === 'object') {
      const id = (txOutcomeId as Record<string, unknown>).id;
      if (typeof id === 'string' && id.length > 0) return id;
    }

    const fallback = (outcome as unknown as Record<string, unknown>).transaction_hash;
    return typeof fallback === 'string' && fallback.length > 0 ? fallback : undefined;
  }

  private extractNearExecutionLogs(outcome: FinalExecutionOutcome): string[] {
    const logs: string[] = [];
    for (const entry of outcome.transaction_outcome.outcome.logs) {
      logs.push(String(entry));
    }
    for (const receipt of outcome.receipts_outcome) {
      for (const entry of receipt.outcome.logs) {
        logs.push(String(entry));
      }
    }
    return logs;
  }

  private mapAuthenticatorsFromContract(
    authenticators: Array<{ credentialId: string; authenticator: StoredAuthenticator }>
  ) {
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
      const txNonce = signedTx.transaction.nonce;
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
    const walletTheme = this.context.configs.walletTheme;
    const hadUserRecordBefore = (walletTheme === 'dark' || walletTheme === 'light')
      ? !!(await IndexedDBManager.clientDB.getUserByDevice(accountId, rec.deviceNumber).catch(() => null))
      : false;

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
    await persistInitialThemePreferenceFromWalletTheme({
      nearAccountId: accountId,
      deviceNumber: rec.deviceNumber,
      walletTheme: walletTheme === 'dark' || walletTheme === 'light' ? walletTheme : undefined,
      hadUserRecordBefore,
      logTag: 'EmailRecoveryFlow',
    });
  }

  /**
   * Explicitly persist the authenticator from the recovery record into the local cache.
   * This ensures the key is available immediately, bridging the gap before RPC sync sees it.
   */
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
        syncedAt: new Date().toISOString(), // Local truth is fresh
        vrfPublicKey: rec.vrfPublicKey,
      });
      console.log('[EmailRecoveryFlow] Locally persisted recovered authenticator for immediate use.');
    } catch (e) {
      console.error('[EmailRecoveryFlow] Failed to locally persist authenticator (critical for immediate export):', e);
      // We log error but don't rethrow to avoid crashing the final success UI.
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
    } catch (err: unknown) {
      return { success: false, reason: errorMessage(err) || String(err) };
    }
  }

  private async handleAutoLoginFailure(reason: string, err?: unknown): Promise<AutoLoginResult> {
    console.warn('[EmailRecoveryFlow] Auto-login failed after recovery', err ?? reason);
    try {
      await this.context.webAuthnManager.clearVrfSession();
    } catch {}
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
      const signedTx = await this.signNewDevice2RegistrationTx(rec, accountId);
      const txHash = await this.broadcastRegistrationTxAndWaitFinal(rec, signedTx);
      if (!txHash) {
        console.warn('[EmailRecoveryFlow] Registration transaction confirmed without hash; continuing local persistence');
      }

      // CRITICAL: Persist local state immediately.
      // 1. Store the new user record (Device N) so that `getLastUser()` finds it.
      await this.persistRecoveredUserData(rec, accountId);

      // 2. Sync authenticators (RPC might be stale, but we try).
      await this.syncAuthenticatorsBestEffort(accountId);

      // 3. FORCE-SAVE the local authenticator from our recovery record.
      // This is crucial because RPC sync might be slow/empty immediately after TX.
      // We must ensure the new key is in the DB so `ensureCurrentPasskey` finds it.
      // We do this AFTER sync to ensure it's not wiped by a stale sync.
      await this.persistAuthenticatorBestEffort(rec, accountId);

      // 4. Set as active user to ensure immediate subsequent calls use this identity.
      await this.setLastUserBestEffort(accountId, rec.deviceNumber);

      await this.updateNonceBestEffort(nonceManager, signedTx);

      // Activate threshold enrollment for this device by ensuring threshold key
      // material is available locally (and AddKey if needed).
      if (txHash) {
        await this.activateThresholdEnrollment(accountId, rec, txHash);
      }

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
    } catch (e: unknown) {
      rec.status = 'error';
      await this.savePending(rec).catch(() => { });
      const original = e instanceof Error
        ? e
        : new Error(errorMessage(e) || 'Email recovery finalization failed');
      const err = this.emitError(5, original);
      await this.options?.afterCall?.(false);
      throw err;
    }
  }

  private async activateThresholdEnrollment(
    accountId: AccountId,
    rec: PendingEmailRecovery,
    registrationTxHash: string,
  ): Promise<void> {
    const deviceNumber = parseDeviceNumber(rec.deviceNumber, { min: 1 });
    if (deviceNumber === null) {
      throw new Error(`Invalid deviceNumber for threshold enrollment: ${String(rec.deviceNumber)}`);
    }

    // Ensure WebAuthn allowCredentials selection prefers this device's passkey
    // when multiple authenticators exist for the account.
    try {
      await this.context.webAuthnManager.setLastUser(accountId, deviceNumber);
    } catch {}

    const existing = await IndexedDBManager.nearKeysDB.getThresholdKeyMaterial(accountId, deviceNumber);
    if (existing) {
      return;
    }

    const relayerUrl = this.context.configs.relayer.url;
    if (!relayerUrl) {
      throw new Error('Missing configs.relayer.url (required for threshold enrollment)');
    }

    const localKeyMaterial = await IndexedDBManager.nearKeysDB.getLocalKeyMaterial(accountId, deviceNumber);
    if (!localKeyMaterial) {
      throw new Error(`Missing local key material for ${String(accountId)} device ${deviceNumber}`);
    }

    const derived = await this.context.webAuthnManager.deriveThresholdEd25519ClientVerifyingShareFromCredential({
      credential: rec.credential,
      nearAccountId: accountId,
      wrapKeySalt: localKeyMaterial.wrapKeySalt,
    });
    if (!derived.success) {
      throw new Error(derived.error || 'Failed to derive threshold client verifying share');
    }

    const keygen = await thresholdEd25519KeygenFromRegistrationTx(relayerUrl, {
      nearAccountId: accountId,
      clientVerifyingShareB64u: derived.clientVerifyingShareB64u,
      registrationTxHash,
    });
    if (!keygen.ok) {
      throw new Error(keygen.error || keygen.message || keygen.code || 'Threshold registration keygen failed');
    }

    const thresholdPublicKey = ensureEd25519Prefix(keygen.publicKey || '');
    if (!thresholdPublicKey) throw new Error('Threshold registration keygen returned empty publicKey');
    const relayerKeyId = String(keygen.relayerKeyId || '').trim();
    if (!relayerKeyId) throw new Error('Threshold registration keygen returned empty relayerKeyId');
    const relayerVerifyingShareB64u = String(keygen.relayerVerifyingShareB64u || '').trim();
    if (!relayerVerifyingShareB64u) throw new Error('Threshold registration keygen returned empty relayerVerifyingShareB64u');

    // Activate threshold enrollment on-chain by submitting AddKey(thresholdPublicKey) signed with the local key.
    try {
      this.context.webAuthnManager.getNonceManager().initializeUser(accountId, localKeyMaterial.publicKey);
    } catch { }
    const txContext = await this.context.webAuthnManager.getNonceManager().getNonceBlockHashAndHeight(
      this.context.nearClient,
      { force: true },
    );
    const signed = await this.context.webAuthnManager.signAddKeyThresholdPublicKeyNoPrompt({
      nearAccountId: accountId,
      credential: rec.credential,
      wrapKeySalt: localKeyMaterial.wrapKeySalt,
      transactionContext: txContext,
      thresholdPublicKey,
      relayerVerifyingShareB64u,
      clientParticipantId: keygen.clientParticipantId,
      relayerParticipantId: keygen.relayerParticipantId,
      deviceNumber,
    });
    const signedTx = signed?.signedTransaction;
    if (!signedTx) throw new Error('Failed to sign AddKey(thresholdPublicKey) transaction');

    await this.context.nearClient.sendTransaction(
      signedTx,
      DEFAULT_WAIT_STATUS.thresholdAddKey,
    );

    await IndexedDBManager.nearKeysDB.storeKeyMaterial({
      kind: 'threshold_ed25519_2p_v1',
      nearAccountId: String(accountId),
      deviceNumber,
      publicKey: thresholdPublicKey,
      wrapKeySalt: derived.wrapKeySalt,
      relayerKeyId,
      clientShareDerivation: 'prf_first_v1',
      participants: buildThresholdEd25519Participants2pV1({
        clientParticipantId: keygen.clientParticipantId,
        relayerParticipantId: keygen.relayerParticipantId,
        relayerKeyId,
        relayerUrl,
        clientVerifyingShareB64u: derived.clientVerifyingShareB64u,
        relayerVerifyingShareB64u,
        clientShareDerivation: 'prf_first_v1',
      }),
      timestamp: Date.now(),
    });
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
    } catch (err: unknown) {
      return this.handleAutoLoginFailure(errorMessage(err) || String(err), err);
    }
  }
}

function isCodeDoesNotExistError(err: unknown): boolean {
  const msg = [errorMessage(err), (() => {
    try { return String(err); } catch { return ''; }
  })()].filter(Boolean).join(' ');
  if (/CodeDoesNotExist/i.test(msg)) return true;
  if (/CompilationError\s*\(\s*CodeDoesNotExist/i.test(msg)) return true;
  if (/CodeDoesNotExist\s*\{/i.test(msg)) return true;
  try {
    const anyErr = err as { details?: unknown; data?: unknown; cause?: unknown } | null | undefined;
    const details = anyErr?.details ?? anyErr?.data ?? anyErr?.cause;
    if (!details) return false;
    return /CodeDoesNotExist/i.test(JSON.stringify(details));
  } catch {
    return false;
  }
}
