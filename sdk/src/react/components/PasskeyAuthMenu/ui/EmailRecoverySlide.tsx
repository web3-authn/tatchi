import React from 'react';

import {
  EmailRecoveryPhase,
  EmailRecoveryStatus,
  type EmailRecoverySSEEvent,
} from '@/core/types/sdkSentEvents';
import type { TatchiPasskey } from '@/core/TatchiPasskey';
import { EmailRecoveryErrorCode } from '@/core/types/emailRecovery';
import type { EmailRecoveryFlowOptions } from '@/core/TatchiPasskey/emailRecovery';

export interface EmailRecoverySlideProps {
  tatchiPasskey: TatchiPasskey;
  accountId: string;
  refreshLoginState?: (nearAccountId?: string) => Promise<void>;
  emailRecoveryOptions?: {
    onEvent?: (event: EmailRecoverySSEEvent) => void;
    onError?: (error: Error) => void;
};
}

type EmailRecoveryAccountInfo = {
  emailsCount: number;
};

type MailtoUiState = 'ready' | 'opening';

type RecoveryEmailRecord = Awaited<ReturnType<TatchiPasskey['getRecoveryEmails']>>[number];

type ExplorerToast = { url: string; accountId?: string; transactionHash?: string };

const DEFAULT_NEAR_EXPLORER_URL = 'https://testnet.nearblocks.io';
const ACCOUNT_INFO_DEBOUNCE_MS = 350;
const MAILTO_REENABLE_MS = 2_000;

function getExplorerBaseUrl(tatchiPasskey: TatchiPasskey): string {
  return String(tatchiPasskey.configs?.nearExplorerUrl || DEFAULT_NEAR_EXPLORER_URL).replace(/\/$/, '');
}

function getExplorerAccountUrl(args: { base: string; accountId: string }): string {
  const { base, accountId } = args;
  return base.includes('nearblocks.io') ? `${base}/address/${accountId}` : `${base}/accounts/${accountId}`;
}

function getExplorerTxUrl(args: { base: string; txHash: string }): string {
  const { base, txHash } = args;
  return base.includes('nearblocks.io') ? `${base}/txns/${txHash}` : `${base}/transactions/${txHash}`;
}

function getEmailRecoveryErrorCode(err: unknown): EmailRecoveryErrorCode | null {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') return null;
  return Object.values(EmailRecoveryErrorCode).includes(code as EmailRecoveryErrorCode)
    ? (code as EmailRecoveryErrorCode)
    : null;
}

function getEmailRecoveryUiError(err: unknown): { message: string; canRestart: boolean } {
  const fallback = err instanceof Error ? err.message : String(err || '');
  const normalizedFallback = fallback.trim().toLowerCase();
  if (normalizedFallback.includes('recovery email is required')) {
    return {
      message:
        fallback ||
        'Recovery email is required for email-based account recovery. Make sure you send the email from your configured recovery email address.',
      canRestart: true,
    };
  }
  const code = getEmailRecoveryErrorCode(err);
  switch (code) {
    case EmailRecoveryErrorCode.VRF_CHALLENGE_EXPIRED:
      return {
        message: fallback || 'Timed out finalizing registration (VRF challenge expired). Please restart email recovery and try again.',
        canRestart: true,
      };
    case EmailRecoveryErrorCode.REGISTRATION_NOT_VERIFIED:
      return {
        message: fallback || 'Registration did not verify on-chain. Please restart email recovery and try again.',
        canRestart: true,
      };
    default:
      return { message: fallback || 'Email recovery failed', canRestart: false };
  }
}

function getEmailRecoveryErrorTxHash(err: unknown): string | null {
  const carrier = (err as { context?: unknown; details?: unknown } | null);
  const ctx = carrier?.context && typeof carrier.context === 'object' ? carrier.context : null;
  const details = carrier?.details && typeof carrier.details === 'object' ? carrier.details : null;
  const source = ctx ?? details;
  if (!source) return null;
  const txHash = (source as { transactionHash?: unknown }).transactionHash;
  return typeof txHash === 'string' && txHash.trim().length > 0 ? txHash.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function extractTxHashFromEmailRecoveryEvent(ev: EmailRecoverySSEEvent): string | null {
  const data = 'data' in ev ? asRecord(ev.data) : null;
  const rawTxHash = data?.['transactionHash'] ?? data?.['transaction_hash'];
  const txHash = typeof rawTxHash === 'string' ? rawTxHash.trim() : '';
  return txHash || null;
}

function extractElapsedMsFromEmailRecoveryEvent(ev: EmailRecoverySSEEvent): number | null | undefined {
  const data = 'data' in ev ? asRecord(ev.data) : null;
  const elapsedRaw = data?.['elapsedMs'] ?? data?.['elapsed_ms'];
  if (elapsedRaw == null) return null;
  const elapsed = Number(elapsedRaw);
  return Number.isNaN(elapsed) ? undefined : elapsed;
}

function deriveEmailsFromRecoveryRecords(records: RecoveryEmailRecord[]): string[] {
  if (records.length === 0) return [];
  const emails = records
    .map((r) => r.email.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.includes('@'));
  return Array.from(new Set(emails));
}

function EmailRecoveryHeader() {
  return (
    <>
      <div className="w3a-email-recovery-title">Recover Account with Email</div>
      <div className="w3a-email-recovery-help">
        Send a special email to recover your account.
        This email must be sent from the designated email recovery address.
      </div>
    </>
  );
}

function AccountIdInputRow(props: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const { value, onChange, disabled } = props;
  return (
    <div>
      <div className="w3a-input-pill w3a-email-recovery-input-pill">
        <div className="w3a-input-wrap">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="NEAR account ID (e.g. alice.testnet)"
            className="w3a-input"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

function RecoveryEmailsSummary(props: {
  summaryLine: React.ReactNode;
  accountInfoError: string | null;
  localRecoveryEmails: string[];
  showFromWarning: boolean;
}) {
  const { summaryLine, accountInfoError, localRecoveryEmails, showFromWarning } = props;
  return (
    <div className="w3a-email-recovery-summary" aria-live="polite">
      <div>{summaryLine}</div>
      {!!accountInfoError && (
        <div className="w3a-email-recovery-warning">{accountInfoError}</div>
      )}
      {localRecoveryEmails.length > 0 && (
        <div className="w3a-email-recovery-saved-emails" role="list" aria-label="Recovery emails">
          {localRecoveryEmails.map((email) => (
            <span key={email} className="w3a-email-recovery-email-chip w3a-email-recovery-email-chip-static" role="listitem">
              {email}
            </span>
          ))}
        </div>
      )}
      {showFromWarning && (
        <div className="w3a-email-recovery-from-warning">
          {localRecoveryEmails.length === 1
            ? `Check that you are sending the recovery email from ${localRecoveryEmails[0]}.`
            : 'Check that you are sending the recovery email from your designated recovery email.'}
        </div>
      )}
    </div>
  );
}

function EmailRecoveryActions(props: {
  isBusy: boolean;
  pendingMailtoUrl: string | null;
  mailtoUiState: MailtoUiState;
  startDisabled: boolean;
  accountInfoLoading: boolean;
  noRecoveryEmailsConfigured: boolean;
  showRestart: boolean;
  onStart: () => void;
  onOpenDraft: (mailtoUrl: string) => void;
  onRestart: () => void;
}) {
  const {
    isBusy,
    pendingMailtoUrl,
    mailtoUiState,
    startDisabled,
    accountInfoLoading,
    noRecoveryEmailsConfigured,
    showRestart,
    onStart,
    onOpenDraft,
    onRestart,
  } = props;

  return (
    <div className="w3a-email-recovery-actions">
      {(!pendingMailtoUrl || !isBusy) && (
        <button
          onClick={onStart}
          className="w3a-link-device-btn w3a-link-device-btn-primary"
          disabled={startDisabled}
        >
          {accountInfoLoading
            ? 'Checking recovery emails…'
            : noRecoveryEmailsConfigured
              ? 'No recovery emails configured'
              : (isBusy ? 'Working…' : 'Start Email Recovery')}
        </button>
      )}

      {pendingMailtoUrl && (
        <button
          type="button"
          onClick={() => onOpenDraft(pendingMailtoUrl)}
          className="w3a-link-device-btn w3a-link-device-btn-primary"
          disabled={mailtoUiState === 'opening'}
          aria-busy={mailtoUiState === 'opening'}
        >
          {mailtoUiState === 'opening' && <span className="w3a-spinner" aria-hidden="true" />}
          {mailtoUiState === 'opening' ? 'Opening email…' : 'Open recovery email draft'}
        </button>
      )}

      {showRestart && (
        <button
          type="button"
          onClick={onRestart}
          className="w3a-link-device-btn"
          disabled={isBusy}
        >
          Restart email recovery
        </button>
      )}
    </div>
  );
}

function EmailRecoveryStatusPanel(props: {
  errorText: string | null;
  statusText: string | null;
  pollingElapsedMs: number | null;
  explorerToast: ExplorerToast | null;
}) {
  const { errorText, statusText, pollingElapsedMs, explorerToast } = props;
  if (!errorText && !statusText && !explorerToast) return null;

  return (
    <div className={`w3a-email-recovery-status${errorText ? ' is-error' : ''}`}>
      {errorText ? errorText : statusText}
      {pollingElapsedMs != null && !Number.isNaN(pollingElapsedMs) && pollingElapsedMs > 0 && (
        <span className="w3a-email-recovery-elapsed">
          (~{Math.round(pollingElapsedMs / 1000)}s).
        </span>
      )}
      {explorerToast && (
        <>
          <br />
          <a className="w3a-email-recovery-link" href={explorerToast.url} target="_blank" rel="noopener noreferrer">
            View on explorer
          </a>
        </>
      )}
    </div>
  );
}

export const EmailRecoverySlide: React.FC<EmailRecoverySlideProps> = ({
  tatchiPasskey,
  accountId,
  refreshLoginState,
  emailRecoveryOptions
}) => {

  const mountedRef = React.useRef(true);
  const mailtoAttemptTimerRef = React.useRef<number | null>(null);
  const cancelRequestedRef = React.useRef(false);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (mailtoAttemptTimerRef.current != null) {
        window.clearTimeout(mailtoAttemptTimerRef.current);
        mailtoAttemptTimerRef.current = null;
      }
    };
  }, []);

  type NoInferType<T> = [T][T extends any ? 0 : never];
  const safeSet = React.useCallback(<T,>(
    setter: React.Dispatch<React.SetStateAction<T>>,
    value: React.SetStateAction<NoInferType<T>>,
  ) => {
    if (!mountedRef.current) return;
    setter(value);
  }, []);

  const [isBusy, setIsBusy] = React.useState(false);
  const [accountIdInput, setAccountIdInput] = React.useState('');
  const [pendingMailtoUrl, setPendingMailtoUrl] = React.useState<string | null>(null);
  const [pendingNearPublicKey, setPendingNearPublicKey] = React.useState<string | null>(null);
  const [mailtoUiState, setMailtoUiState] = React.useState<MailtoUiState>('ready');
  const [statusText, setStatusText] = React.useState<string | null>(null);
  const [pollingElapsedMs, setPollingElapsedMs] = React.useState<number | null>(null);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [canRestart, setCanRestart] = React.useState(false);
  const [accountInfo, setAccountInfo] = React.useState<EmailRecoveryAccountInfo | null>(null);
  const [accountInfoLoading, setAccountInfoLoading] = React.useState(false);
  const [accountInfoError, setAccountInfoError] = React.useState<string | null>(null);
  const [localRecoveryEmails, setLocalRecoveryEmails] = React.useState<string[]>([]);
  const [explorerToast, setExplorerToast] = React.useState<ExplorerToast | null>(null);

  const lastPrefilledAccountIdRef = React.useRef<string>('');

  React.useEffect(() => {
    const next = (accountId || '').trim();
    if (!next) return;
    if (accountIdInput.trim() === '' || accountIdInput === lastPrefilledAccountIdRef.current) {
      lastPrefilledAccountIdRef.current = next;
      setAccountIdInput(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  React.useEffect(() => {
    setPendingMailtoUrl(null);
    setPendingNearPublicKey(null);
    setMailtoUiState('ready');
    cancelRequestedRef.current = false;
    setStatusText(null);
    setPollingElapsedMs(null);
    setErrorText(null);
    setCanRestart(false);
    setAccountInfo(null);
    setAccountInfoError(null);
    setLocalRecoveryEmails([]);
    setExplorerToast(null);
    if (mailtoAttemptTimerRef.current != null) {
      window.clearTimeout(mailtoAttemptTimerRef.current);
      mailtoAttemptTimerRef.current = null;
    }
  }, [accountId]);

  const onEvent = React.useCallback(
    (ev: EmailRecoverySSEEvent) => {
      if (cancelRequestedRef.current) return;
      safeSet(setStatusText, ev?.message || null);
      emailRecoveryOptions?.onEvent?.(ev);

      const txHash = extractTxHashFromEmailRecoveryEvent(ev);
      if (txHash) {
        const base = getExplorerBaseUrl(tatchiPasskey);
        safeSet(setExplorerToast, { url: getExplorerTxUrl({ base, txHash }), transactionHash: txHash });
      }
      const elapsed = extractElapsedMsFromEmailRecoveryEvent(ev);
      if (elapsed === null) safeSet(setPollingElapsedMs, null);
      else if (elapsed != null) safeSet(setPollingElapsedMs, elapsed);

      if (ev.phase === EmailRecoveryPhase.ERROR || ev.status === EmailRecoveryStatus.ERROR) {
        const raw = 'error' in ev ? ev.error : ev.message;
        safeSet(setErrorText, raw || 'Email recovery failed');
        safeSet(setCanRestart, false);
      }
    },
    [emailRecoveryOptions, safeSet, tatchiPasskey],
  );

  const showExplorerToast = React.useCallback(
    (rawAccountId: string) => {
      const normalized = (rawAccountId || '').trim();
      if (!normalized) return;
      const base = getExplorerBaseUrl(tatchiPasskey);
      safeSet(setExplorerToast, { url: getExplorerAccountUrl({ base, accountId: normalized }), accountId: normalized });
    },
    [safeSet, tatchiPasskey],
  );

  const showExplorerTxToast = React.useCallback(
    (txHash: string) => {
      const normalized = (txHash || '').trim();
      if (!normalized) return;
      const base = getExplorerBaseUrl(tatchiPasskey);
      safeSet(setExplorerToast, { url: getExplorerTxUrl({ base, txHash: normalized }), transactionHash: normalized });
    },
    [safeSet, tatchiPasskey],
  );

  const launchMailto = React.useCallback((rawMailtoUrl: string) => {
    const url = String(rawMailtoUrl || '').trim();
    if (!url) return;

    if (typeof window !== 'undefined') {
      try {
        window.location.href = url;
      } catch {}
    }
  }, []);

  const attemptOpenMailtoFromUserGesture = React.useCallback(
    (rawMailtoUrl: string) => {
      const url = String(rawMailtoUrl || '').trim();
      if (!url) return;

      safeSet(setMailtoUiState, 'opening');

      if (mailtoAttemptTimerRef.current != null) {
        window.clearTimeout(mailtoAttemptTimerRef.current);
      }

      // If the browser never blurs/hides (i.e. mailto blocked or cancelled), re-enable so users can retry.
      mailtoAttemptTimerRef.current = window.setTimeout(() => {
        safeSet(setMailtoUiState, prev => (prev === 'opening' ? 'ready' : prev));
        mailtoAttemptTimerRef.current = null;
      }, MAILTO_REENABLE_MS);

      launchMailto(url);
    },
    [launchMailto, safeSet],
  );

  const attemptOpenMailtoAuto = React.useCallback(
    (rawMailtoUrl: string) => {
      const url = String(rawMailtoUrl || '').trim();
      if (!url) return;
      // Best-effort only: do not change `mailtoUiState` so users can immediately click the CTA.
      launchMailto(url);
    },
    [launchMailto],
  );

  React.useEffect(() => {
    if (mailtoUiState !== 'opening') return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Heuristic signals that the mail client likely opened. Treat as a hint only:
    // re-enable immediately so the CTA remains retryable even if this is a false-positive.
    const markMaybeOpened = () => {
      safeSet(setMailtoUiState, 'ready');
      if (mailtoAttemptTimerRef.current != null) {
        window.clearTimeout(mailtoAttemptTimerRef.current);
        mailtoAttemptTimerRef.current = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') markMaybeOpened();
    };

    window.addEventListener('blur', markMaybeOpened);
    window.addEventListener('pagehide', markMaybeOpened);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('blur', markMaybeOpened);
      window.removeEventListener('pagehide', markMaybeOpened);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [mailtoUiState, safeSet]);

  React.useEffect(() => {
    const normalized = (accountIdInput || '').trim();
    if (!normalized) {
      setAccountInfo(null);
      setAccountInfoError(null);
      setAccountInfoLoading(false);
      safeSet(setLocalRecoveryEmails, []);
      return;
    }

    let cancelled = false;
    // Show loading state immediately (don't wait for debounce).
    safeSet(setAccountInfoLoading, true);
    safeSet(setAccountInfoError, null);
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const records = await tatchiPasskey.getRecoveryEmails(normalized);
          const resolvedEmails = deriveEmailsFromRecoveryRecords(records);

          if (!cancelled) {
            safeSet(setLocalRecoveryEmails, resolvedEmails);
          }

          const info: EmailRecoveryAccountInfo | null = records
            ? { emailsCount: Array.isArray(records) ? records.length : 0 }
            : null;
          if (cancelled) return;
          safeSet(setAccountInfo, info);
        } catch (err: unknown) {
          if (cancelled) return;
          safeSet(setAccountInfo, null);
          const msg = err instanceof Error ? err.message : '';
          safeSet(setAccountInfoError, msg || 'Failed to load email recovery settings for this account');
          safeSet(setLocalRecoveryEmails, []);
        } finally {
          if (!cancelled) safeSet(setAccountInfoLoading, false);
        }
      })();
    }, ACCOUNT_INFO_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [accountIdInput, safeSet, tatchiPasskey]);

  const handleStart = React.useCallback(async () => {
    const normalizedAccountId = (accountIdInput || '').trim();
    if (!normalizedAccountId) {
      safeSet(setErrorText, 'Enter an account ID.');
      return;
    }

    if (accountInfoLoading) {
      safeSet(setErrorText, 'Checking recovery email settings…');
      return;
    }

    if (accountInfoError) {
      safeSet(setErrorText, accountInfoError);
      return;
    }

    if (!accountInfo) {
      safeSet(setErrorText, 'Failed to load email recovery settings for this account.');
      return;
    }

    if (accountInfo.emailsCount === 0) {
      safeSet(setErrorText, 'No recovery emails are configured for this account.');
      return;
    }

    safeSet(setIsBusy, true);
    cancelRequestedRef.current = false;
    safeSet(setErrorText, null);
    safeSet(setCanRestart, false);
    safeSet(setStatusText, null);
    safeSet(setPollingElapsedMs, null);
    safeSet(setPendingMailtoUrl, null);
    safeSet(setPendingNearPublicKey, null);
    safeSet(setMailtoUiState, 'ready');

    let didForwardError = false;
    try {
      const result = await tatchiPasskey.startEmailRecovery({
        accountId: normalizedAccountId,
        options: {
          onEvent,
          onError: (err: Error) => {
            if (cancelRequestedRef.current) return;
            safeSet(setErrorText, err?.message || 'Failed to start email recovery');
            didForwardError = true;
            emailRecoveryOptions?.onError?.(err);
          },
        } satisfies EmailRecoveryFlowOptions,
      });

      safeSet(setPendingMailtoUrl, result.mailtoUrl);
      safeSet(setPendingNearPublicKey, result.nearPublicKey);
      safeSet(
        setStatusText,
        'Recovery email draft ready. If it didn’t open automatically, click “Open recovery email draft”. Waiting for verification…'
      );

      // Best-effort open. If blocked/cancelled, the CTA remains immediately clickable for a user-gesture retry.
      attemptOpenMailtoAuto(result.mailtoUrl);

      // Start polling immediately after attempting to open the email prompt.
      const finalizePromise = tatchiPasskey.finalizeEmailRecovery({
        accountId: normalizedAccountId,
        nearPublicKey: result.nearPublicKey,
        options: {
          onEvent,
          onError: (err: Error) => {
            if (cancelRequestedRef.current) return;
            const uiError = getEmailRecoveryUiError(err);
            safeSet(setErrorText, uiError.message || 'Failed to finalize email recovery');
            safeSet(setCanRestart, uiError.canRestart);
            const txHash = getEmailRecoveryErrorTxHash(err);
            if (txHash) showExplorerTxToast(txHash);
            didForwardError = true;
            emailRecoveryOptions?.onError?.(err);
          },
        } satisfies EmailRecoveryFlowOptions,
      });

      showExplorerToast(normalizedAccountId);

      await finalizePromise;

      // Best-effort auto-login: the core flow attempts it, but if it couldn't (e.g. missing Shamir
      // auto-unlock and user cancelled TouchID), try once more here.
      let loginOk = false;
      const session = await tatchiPasskey.getLoginSession(normalizedAccountId).catch(() => null);
      if (session?.login?.isLoggedIn) {
        loginOk = true;
      } else {
        safeSet(setStatusText, 'Email recovery completed. Logging you in…');
        loginOk = await tatchiPasskey
          .loginAndCreateSession(normalizedAccountId)
          .then(() => true)
          .catch(() => false);
      }

      if (refreshLoginState) {
        await refreshLoginState(normalizedAccountId).catch(() => {});
      }

      safeSet(
        setStatusText,
        loginOk ? 'Email recovery completed on this device.' : 'Email recovery completed. Please log in on this device.'
      );
      safeSet(setPendingMailtoUrl, null);
      safeSet(setMailtoUiState, 'ready');
      safeSet(setPollingElapsedMs, null);
    } catch (err: unknown) {
      if (cancelRequestedRef.current) {
        safeSet(setErrorText, 'Email recovery cancelled. Please try again.');
        safeSet(setStatusText, null);
        safeSet(setPollingElapsedMs, null);
        safeSet(setPendingMailtoUrl, null);
        safeSet(setPendingNearPublicKey, null);
        safeSet(setMailtoUiState, 'ready');
        safeSet(setCanRestart, false);
        return;
      }
      const uiError = getEmailRecoveryUiError(err);
      safeSet(setErrorText, uiError.message || 'Failed to start email recovery');
      safeSet(setCanRestart, uiError.canRestart);
      const txHash = getEmailRecoveryErrorTxHash(err);
      if (txHash) showExplorerTxToast(txHash);
      if (!didForwardError && err instanceof Error) {
        emailRecoveryOptions?.onError?.(err);
      }
    } finally {
      safeSet(setIsBusy, false);
    }
  }, [
    accountIdInput,
    accountInfo,
    accountInfoError,
    accountInfoLoading,
    attemptOpenMailtoAuto,
    emailRecoveryOptions,
    onEvent,
    refreshLoginState,
    safeSet,
    showExplorerToast,
    showExplorerTxToast,
    tatchiPasskey,
  ]);

  const handleRestart = React.useCallback(async () => {
    const normalizedAccountId = (accountIdInput || '').trim();
    if (!normalizedAccountId) return;

    safeSet(setIsBusy, true);
    try {
      cancelRequestedRef.current = true;
      await tatchiPasskey
        .cancelEmailRecovery({
          accountId: normalizedAccountId,
          nearPublicKey: pendingNearPublicKey || undefined,
        })
        .catch(() => {});
      safeSet(setErrorText, null);
      safeSet(setStatusText, null);
      safeSet(setPollingElapsedMs, null);
      safeSet(setPendingMailtoUrl, null);
      safeSet(setPendingNearPublicKey, null);
      safeSet(setMailtoUiState, 'ready');
      safeSet(setCanRestart, false);
    } finally {
      cancelRequestedRef.current = false;
      safeSet(setIsBusy, false);
    }
  }, [accountIdInput, pendingNearPublicKey, safeSet, tatchiPasskey]);

  const summaryLine: React.ReactNode = accountInfoLoading
    ? (
      <>
        Checking if account has recovery emails configured
        <span className="w3a-ellipsis" aria-hidden="true">
          <span className="w3a-ellipsis-dot">.</span>
          <span className="w3a-ellipsis-dot">.</span>
          <span className="w3a-ellipsis-dot">.</span>
        </span>
      </>
    )
    : accountInfo && !accountInfoError
      ? `Recovery emails configured: ${accountInfo.emailsCount}`
      : '\u00A0';

  const noRecoveryEmailsConfigured =
    !accountInfoLoading && !accountInfoError && !!accountInfo && accountInfo.emailsCount === 0;
  const startDisabled = isBusy || accountInfoLoading || !!accountInfoError || !accountInfo || noRecoveryEmailsConfigured;
  const showFromWarning = !!accountIdInput.trim() && !noRecoveryEmailsConfigured;
  const showRestart = !!errorText && canRestart;

  return (
    <div className="w3a-email-recovery-slide">
      <EmailRecoveryHeader />
      <AccountIdInputRow value={accountIdInput} onChange={setAccountIdInput} disabled={isBusy} />
      <RecoveryEmailsSummary
        summaryLine={summaryLine}
        accountInfoError={accountInfoError}
        localRecoveryEmails={localRecoveryEmails}
        showFromWarning={showFromWarning}
      />
      <EmailRecoveryActions
        isBusy={isBusy}
        pendingMailtoUrl={pendingMailtoUrl}
        mailtoUiState={mailtoUiState}
        startDisabled={startDisabled}
        accountInfoLoading={accountInfoLoading}
        noRecoveryEmailsConfigured={noRecoveryEmailsConfigured}
        showRestart={showRestart}
        onStart={handleStart}
        onOpenDraft={attemptOpenMailtoFromUserGesture}
        onRestart={handleRestart}
      />
      <EmailRecoveryStatusPanel
        errorText={errorText}
        statusText={statusText}
        pollingElapsedMs={pollingElapsedMs}
        explorerToast={explorerToast}
      />
    </div>
  );
};

export default EmailRecoverySlide;
